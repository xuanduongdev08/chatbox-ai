"""
Agent Tool Definitions:
  1. web_search  – Tavily search API for live web results
  2. sql_query   – Read-only PostgreSQL analytics queries
  3. email_sender – SMTP/SendGrid email notification
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import httpx
from langchain_core.tools import tool

from app.core.config import settings

logger = logging.getLogger(__name__)


# ─── Web Search Tool ──────────────────────────────────────────────────────────

@tool
async def web_search(query: str, max_results: int = 5) -> str:
    """
    Search the web for current information using Tavily Search API.
    Use this to get up-to-date facts, news, or any information beyond your training data.

    Args:
        query: The search query string.
        max_results: Maximum number of results to return (default 5).

    Returns:
        A formatted string of search results with titles, URLs, and snippets.
    """
    if not settings.tavily_api_key:
        # Fallback to DuckDuckGo if no Tavily key
        return await _duckduckgo_search(query, max_results)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "max_results": max_results,
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


async def _duckduckgo_search(query: str, max_results: int) -> str:
    """Fallback DuckDuckGo search via DDG Instant Answer API."""
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
    Execute a read-only SQL SELECT query against the analytics PostgreSQL database.
    ONLY SELECT statements are permitted – any modification queries will be rejected.

    Args:
        sql: A valid PostgreSQL SELECT statement.

    Returns:
        Query results formatted as a markdown table.
    """
    import asyncpg

    sql_stripped = sql.strip().upper()
    if not sql_stripped.startswith("SELECT"):
        return "Error: Only SELECT queries are permitted."

    # Reject dangerous keywords even in sub-queries
    forbidden = ["DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE", "ALTER", "CREATE"]
    if any(kw in sql_stripped for kw in forbidden):
        return "Error: Query contains forbidden SQL keywords."

    try:
        conn = await asyncpg.connect(
            settings.postgres_url.replace("postgresql+asyncpg://", "postgresql://")
        )
        try:
            rows = await conn.fetch(sql)
            if not rows:
                return "Query returned no results."

            # Format as markdown table
            headers = list(rows[0].keys())
            header_row = " | ".join(headers)
            separator = " | ".join(["---"] * len(headers))
            data_rows = [
                " | ".join(str(row[h]) for h in headers)
                for row in rows[:50]  # cap at 50 rows
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
        msg = MIMEMultipart("alternative")
        msg["From"] = settings.email_from
        msg["To"] = to_address
        msg["Subject"] = subject

        content_type = "html" if is_html else "plain"
        msg.attach(MIMEText(body, content_type))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.email_from, to_address, msg.as_string())

        logger.info("Email sent to %s: %s", to_address, subject)
        return f"Email successfully sent to {to_address} with subject '{subject}'."
    except Exception as exc:
        logger.error("Email send failed: %s", exc)
        return f"Failed to send email: {exc}"


# ─── Tool Registry ────────────────────────────────────────────────────────────

AVAILABLE_TOOLS = {
    "web_search": web_search,
    "sql_query": sql_query,
    "email_sender": email_sender,
}


def get_tools(names: Optional[list] = None):
    """Return tool instances by name, or all tools if names is None."""
    if names is None:
        return list(AVAILABLE_TOOLS.values())
    return [AVAILABLE_TOOLS[n] for n in names if n in AVAILABLE_TOOLS]
