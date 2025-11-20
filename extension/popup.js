document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab');
  const views = {
    dashboard: document.getElementById('view-dashboard'),
    settings: document.getElementById('view-settings')
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update tabs
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update views
      const target = tab.dataset.target;
      Object.values(views).forEach(v => v.style.display = 'none');
      views[target].style.display = 'block';
    });
  });

  // Mock stats update
  setTimeout(() => {
    document.getElementById('stat-pages').textContent = '13';
    document.getElementById('stat-fields').textContent = '148';
  }, 2000);
});
