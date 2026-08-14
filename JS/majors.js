document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("majorSearch");
  const searchButton = document.getElementById("searchButton");
  const filterButtons = document.querySelectorAll(".filter-button");
  const cards = document.querySelectorAll(".major-card");
  const resultsCount = document.getElementById("resultsCount");
  const noResults = document.getElementById("noResults");

  let activeFilter = "all";

  function normalizeText(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[ًٌٍَُِّْـ]/g, "");
  }

  function updateResults() {
    const query = normalizeText(searchInput.value);
    let visibleCount = 0;

    cards.forEach(function (card) {
      const cardText = normalizeText(card.dataset.search || card.textContent);

      const type = card.dataset.type || "";

      const matchesSearch = query === "" || cardText.includes(query);

      const matchesFilter = activeFilter === "all" || type === activeFilter;

      const visible = matchesSearch && matchesFilter;

      card.hidden = !visible;

      if (visible) {
        visibleCount++;
      }
    });

    resultsCount.textContent = visibleCount + " تخصصاً";

    noResults.hidden = visibleCount !== 0;
  }

  searchInput.addEventListener("input", updateResults);

  searchButton.addEventListener("click", function () {
    updateResults();
    searchInput.focus();
  });

  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      filterButtons.forEach(function (item) {
        item.classList.remove("active");
      });

      button.classList.add("active");

      activeFilter = button.dataset.filter;

      updateResults();
    });
  });

  document.querySelectorAll(".favorite-button").forEach(function (button) {
    button.addEventListener("click", function () {
      const icon = button.querySelector("i");

      icon.classList.toggle("fa-regular");
      icon.classList.toggle("fa-solid");

      button.classList.toggle("selected");
    });
  });
});
