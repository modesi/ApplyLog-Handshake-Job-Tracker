
    document.addEventListener("DOMContentLoaded", () => {
      const savedButton = document.querySelector('[data-tab="saved"]');
        savedButton.addEventListener("click", switchToSavedJobs);
      const appliedButton = document.querySelector('[data-tab="applied"]');
        appliedButton.addEventListener("click", switchToAppliedJobs);
    });

    function switchToSavedJobs() {
        document.getElementById("saved-content").classList.add("active");
        document.getElementById("applied-content").classList.remove("active");
        document.querySelector('.tab[data-tab="saved"]').classList.add('active');
        document.querySelector('.tab[data-tab="applied"]').classList.remove('active');
    }

    function switchToAppliedJobs() {
        document.getElementById("applied-content").classList.add("active");
        document.getElementById("saved-content").classList.remove("active");
        document.querySelector('.tab[data-tab="applied"]').classList.add('active');
        document.querySelector('.tab[data-tab="saved"]').classList.remove('active');
    }


    