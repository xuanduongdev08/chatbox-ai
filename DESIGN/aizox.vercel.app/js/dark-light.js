// light-theme
if (localStorage.toggled === "light-theme") {
  document.documentElement.classList.add("light-theme");
}

// elements
var toggle = document.querySelector(".button-dark-light");
var htmlEl = document.documentElement;

var logo = document.getElementById("logo_header");
var tflight = logo ? logo.dataset.light : "";
var tfdark  = logo ? logo.dataset.dark : "";

// click toggle
if (toggle) {
  toggle.addEventListener("click", function () {
    if (localStorage.toggled !== "light-theme") {
      htmlEl.classList.add("light-theme");
      localStorage.toggled = "light-theme";
      if (logo) logo.src = tflight;
    } else {
      htmlEl.classList.remove("light-theme");
      localStorage.toggled = "";
      if (logo) logo.src = tfdark;
    }
  });
}

// init logo
if (htmlEl.classList.contains("light-theme")) {
  if (logo) logo.src = tflight;
} else {
  if (logo) logo.src = tfdark;
}
