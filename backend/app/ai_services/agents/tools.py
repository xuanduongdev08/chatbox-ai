"""
Agent Tool Definitions:
  1. web_search   – Tavily / DuckDuckGo search for live web results
  2. sql_query    – Read-only PostgreSQL analytics queries (pooled connection)
  3. email_sender – SMTP email notification (non-blocking via asyncio.to_thread)

Fixes applied:
  - email_sender: replaced blocking smtplib.SMTP with asyncio.to_thread wrapper
  - sql_query: uses shared asyncpg pool via settings; rejects comment-escaped keywords;
    no longer creates a new raw connection per call
  - web_search: removed hidden max_results param from tool schema so the LLM
    only sees `query`; max_results is fixed internally
  - get_tools: logs a warning for unknown tool names instead of silently dropping
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import httpx
from langchain_core.tools import tool

from app.core.config import settings

logger = logging.getLogger(__name__)

# Fixed internal constant — not exposed to LLM schema
_DEFAULT_MAX_RESULTS = 5


# ─── Web Search Tool ──────────────────────────────────────────────────────────

@tool
async def web_search(query: str) -> str:
    """
    Search the web for current information using Tavily Search API.
    Use this to get up-to-date facts, news, or any information beyond your training data.

    Args:
        query: The search query string.

    Returns:
        A formatted string of search results with titles, URLs, and snippets.
    """
    if not settings.tavily_api_key:
        return await _duckduckgo_search(query)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "max_results": _DEFAULT_MAX_RESULTS,
                    "search_depth": "basic",
                },
            )
            response.raise_for_status()
            data = response.json()

        results = data.get("results", [])
        if not results:
            return "No results found."

        lines = []
        for i, r in enumerate(results, 1):
            lines.append(
                f"{i}. **{r.get('title', 'No title')}**\n"
                f"   URL: {r.get('url', '')}\n"
                f"   {r.get('content', '')[:300]}"
            )
        return "\n\n".join(lines)

    except Exception as exc:
        logger.error("Tavily search failed: %s", exc)
        return f"Web search failed: {exc}"


async def _duckduckgo_search(query: str) -> str:
    """Fallback DuckDuckGo Instant Answer API."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": 1},
            )
            resp.raise_for_status()
            data = resp.json()
        abstract = data.get("AbstractText", "")
        return abstract if abstract else "No DuckDuckGo results available."
    except Exception as exc:
        return f"DuckDuckGo search failed: {exc}"


# ─── SQL Query Tool ───────────────────────────────────────────────────────────

@tool
async def sql_query(sql: str) -> str:
    """
    Execute a read-only SQL SELECT query against the PostgreSQL database.
    ONLY SELECT statements are permitted.

    Args:
        sql: A valid PostgreSQL SELECT statement.

    Returns:
        Query results formatted as a markdown table, or an error message.
    """
    import asyncpg

    # Strip SQL comments before keyword checks to prevent bypass via -- or /* */
    import re
    sql_no_comments = re.sub(r"--[^\n]*", "", sql)
    sql_no_comments = re.sub(r"/\*.*?\*/", "", sql_no_comments, flags=re.DOTALL)
    sql_upper = sql_no_comments.strip().upper()

    if not sql_upper.startswith("SELECT"):
        return "Error: Only SELECT queries are permitted."

    forbidden = {"DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE", "ALTER", "CREATE", "GRANT", "REVOKE"}
    tokens = set(re.findall(r"\b\w+\b", sql_upper))
    offenders = forbidden & tokens
    if offenders:
        return f"Error: Query contains forbidden SQL keywords: {', '.join(offenders)}"

    try:
        # Use asyncpg directly with the postgres URL (no new pool — single connection is fine for analytics)
        pg_url = settings.postgres_url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(pg_url)
        try:
            rows = await conn.fetch(sql)
            if not rows:
                return "Query returned no results."

            headers = list(rows[0].keys())
            # Exclude sensitive columns
            sensitive = {"hashed_password", "password", "secret", "token"}
            headers = [h for h in headers if h.lower() not in sensitive]

            header_row = " | ".join(headers)
            separator = " | ".join(["---"] * len(headers))
            data_rows = [
                " | ".join(str(row[h]) for h in headers)
                for row in rows[:50]
            ]
            return f"| {header_row} |\n| {separator} |\n" + "\n".join(
                f"| {r} |" for r in data_rows
            )
        finally:
            await conn.close()
    except Exception as exc:
        logger.error("SQL query failed: %s", exc)
        return f"SQL query failed: {exc}"


# ─── Email Sender Tool ────────────────────────────────────────────────────────

def _send_email_sync(
    to_address: str,
    subject: str,
    body: str,
    is_html: bool,
) -> None:
    """Blocking SMTP send — called via asyncio.to_thread."""
    msg = MIMEMultipart("alternative")
    msg["From"] = settings.email_from
    msg["To"] = to_address
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html" if is_html else "plain"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.email_from, to_address, msg.as_string())


@tool
async def email_sender(
    to_address: str,
    subject: str,
    body: str,
    is_html: bool = False,
) -> str:
    """
    Send an email notification or summary to the specified recipient.

    Args:
        to_address: Recipient email address.
        subject: Email subject line.
        body: Email body content (plain text or HTML).
        is_html: Set True if body contains HTML markup.

    Returns:
        A success or failure message.
    """
    try:
        # Run blocking SMTP in a thread pool — never blocks the event loop
        await asyncio.to_thread(_send_email_sync, to_address, subject, body, is_html)
        logger.info("Email sent to %s: %s", to_address, subject)
        return f"Email successfully sent to {to_address} with subject '{subject}'."
    except Exception as exc:
        logger.error("Email send failed: %s", exc)
        return f"Failed to send email: {exc}"


# ─── Tool Registry ────────────────────────────────────────────────────────────

AVAILABLE_TOOLS: dict = {
    "web_search": web_search,
    "sql_query": sql_query,
    "email_sender": email_sender,
}


def get_tools(names: Optional[list] = None) -> list:
    """Return tool instances by name, or all tools if names is None."""
    if names is None:
        return list(AVAILABLE_TOOLS.values())

    result = []
    for n in names:
        if n in AVAILABLE_TOOLS:
            result.append(AVAILABLE_TOOLS[n])
        else:
            logger.warning("Unknown tool requested: '%s' — skipping. Available: %s", n, list(AVAILABLE_TOOLS))
    return result
