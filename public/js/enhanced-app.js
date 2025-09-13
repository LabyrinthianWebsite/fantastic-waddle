// Enhanced CommissionDB Frontend with new features
class EnhancedCommissionDB {
  constructor() {
    this.isAdvancedSearchOpen = false;
    this.lazyImageObserver = null;
    this.searchCache = new Map();
    this.init();
  }

  init() {
    this.setupLazyLoading();
    this.setupAdvancedSearch();
    this.setupCacheManagement();
    this.setupAnalyticsDashboard();
    this.setupImageAnalysis();
    this.setupBackupManagement();
    this.setupInfiniteScroll();
    this.setupDragAndDrop();
  }

  // Lazy loading for images
  setupLazyLoading() {
    if ('IntersectionObserver' in window) {
      this.lazyImageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            observer.unobserve(img);
          }
        });
      });

      document.querySelectorAll('img[data-src]').forEach(img => {
        this.lazyImageObserver.observe(img);
      });
    }
  }

  // Advanced search functionality
  setupAdvancedSearch() {
    const advancedSearchToggle = document.getElementById('advanced-search-toggle');
    const advancedSearchPanel = document.getElementById('advanced-search-panel');
    
    if (advancedSearchToggle && advancedSearchPanel) {
      advancedSearchToggle.addEventListener('click', () => {
        this.isAdvancedSearchOpen = !this.isAdvancedSearchOpen;
        advancedSearchPanel.style.display = this.isAdvancedSearchOpen ? 'block' : 'none';
        advancedSearchToggle.textContent = this.isAdvancedSearchOpen ? 'Hide Advanced Search' : 'Show Advanced Search';
      });
    }

    // Full-text search with debouncing
    const searchInput = document.getElementById('main-search');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.performFullTextSearch(e.target.value);
        }, 300);
      });
    }
  }

  async performFullTextSearch(query) {
    if (query.length < 2) return;

    try {
      const response = await fetch(`/api/search?type=all&q=${encodeURIComponent(query)}`);
      const results = await response.json();
      this.displaySearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    }
  }

  displaySearchResults(results) {
    const container = document.getElementById('search-results');
    if (!container) return;

    container.innerHTML = '';

    if (results.total === 0) {
      container.innerHTML = '<p>No results found.</p>';
      return;
    }

    // Display results by type
    ['commissions', 'artists', 'characters', 'tags'].forEach(type => {
      if (results[type] && results[type].length > 0) {
        const section = document.createElement('div');
        section.className = 'search-section';
        section.innerHTML = `
          <h3>${type.charAt(0).toUpperCase() + type.slice(1)}</h3>
          <div class="search-results-grid">
            ${results[type].map(item => this.renderSearchResult(item, type)).join('')}
          </div>
        `;
        container.appendChild(section);
      }
    });
  }

  renderSearchResult(item, type) {
    const snippet = item.snippet ? `<p class="search-snippet">${item.snippet}</p>` : '';
    
    switch (type) {
      case 'commissions':
        return `
          <div class="search-result-item">
            <a href="/commission/${item.slug}">
              <h4>${item.name}</h4>
              ${snippet}
            </a>
          </div>
        `;
      case 'artists':
        return `
          <div class="search-result-item">
            <a href="/artist/${item.slug}">
              <h4>${item.name}</h4>
              ${snippet}
            </a>
          </div>
        `;
      case 'characters':
        return `
          <div class="search-result-item">
            <a href="/character/${item.slug}">
              <h4>${item.name}</h4>
              ${snippet}
            </a>
          </div>
        `;
      case 'tags':
        return `
          <div class="search-result-item">
            <a href="/tag/${item.slug}">
              <h4>${item.name}</h4>
              ${snippet}
            </a>
          </div>
        `;
      default:
        return '';
    }
  }

  // Cache management
  setupCacheManagement() {
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => {
        this.showCacheManagementModal();
      });
    }
  }

  showCacheManagementModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Cache Management</h3>
        <div class="cache-stats" id="cache-stats">Loading...</div>
        <div class="cache-actions">
          <button onclick="enhancedApp.clearCache('search')">Clear Search Cache</button>
          <button onclick="enhancedApp.clearCache('stats')">Clear Stats Cache</button>
          <button onclick="enhancedApp.clearCache('images')">Clear Image Cache</button>
          <button onclick="enhancedApp.clearCache('all')" class="danger">Clear All Caches</button>
        </div>
        <button onclick="enhancedApp.closeModal()" class="close-btn">Close</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.loadCacheStats();
  }

  async loadCacheStats() {
    try {
      const response = await fetch('/api/cache/stats');
      const stats = await response.json();
      
      const container = document.getElementById('cache-stats');
      if (container) {
        container.innerHTML = `
          <div class="cache-stat">
            <strong>Search Cache:</strong> ${stats.search.keys} keys, ${stats.search.hits} hits, ${stats.search.misses} misses
          </div>
          <div class="cache-stat">
            <strong>Stats Cache:</strong> ${stats.stats.keys} keys, ${stats.stats.hits} hits, ${stats.stats.misses} misses
          </div>
          <div class="cache-stat">
            <strong>Image Cache:</strong> ${stats.images.keys} keys, ${stats.images.hits} hits, ${stats.images.misses} misses
          </div>
          <div class="cache-stat">
            <strong>User Cache:</strong> ${stats.users.keys} keys, ${stats.users.hits} hits, ${stats.users.misses} misses
          </div>
        `;
      }
    } catch (error) {
      console.error('Error loading cache stats:', error);
    }
  }

  async clearCache(type) {
    try {
      const response = await fetch('/api/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      
      const result = await response.json();
      if (result.success) {
        alert(`${type} cache cleared successfully`);
        this.loadCacheStats(); // Refresh stats
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
      alert('Error clearing cache');
    }
  }

  // Analytics dashboard
  setupAnalyticsDashboard() {
    const analyticsBtn = document.getElementById('analytics-btn');
    if (analyticsBtn) {
      analyticsBtn.addEventListener('click', () => {
        this.showAnalyticsDashboard();
      });
    }
  }

  async showAnalyticsDashboard() {
    try {
      const [trends, correlations] = await Promise.all([
        fetch('/api/analytics/commission-trends').then(r => r.json()),
        fetch('/api/analytics/tag-correlation').then(r => r.json())
      ]);

      const modal = document.createElement('div');
      modal.className = 'modal large-modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h3>Analytics Dashboard</h3>
          <div class="analytics-grid">
            <div class="chart-container">
              <h4>Commission Trends</h4>
              <canvas id="trends-chart" width="400" height="200"></canvas>
            </div>
            <div class="chart-container">
              <h4>Top Tag Correlations</h4>
              <div id="correlations-list"></div>
            </div>
          </div>
          <button onclick="enhancedApp.closeModal()" class="close-btn">Close</button>
        </div>
      `;
      
      document.body.appendChild(modal);
      this.renderTrendsChart(trends);
      this.renderCorrelationsList(correlations);
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  }

  renderTrendsChart(trends) {
    const canvas = document.getElementById('trends-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: trends.map(t => t.date_month),
        datasets: [{
          label: 'Commissions',
          data: trends.map(t => t.commission_count),
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        }, {
          label: 'Average Score',
          data: trends.map(t => t.avg_score),
          borderColor: 'rgb(255, 99, 132)',
          tension: 0.1,
          yAxisID: 'y1'
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: {
              drawOnChartArea: false,
            },
          }
        }
      }
    });
  }

  renderCorrelationsList(correlations) {
    const container = document.getElementById('correlations-list');
    if (!container) return;

    container.innerHTML = correlations.slice(0, 10).map(corr => `
      <div class="correlation-item">
        <span class="tag-pair">${corr.tag1} + ${corr.tag2}</span>
        <span class="count">${corr.co_occurrence_count} times</span>
      </div>
    `).join('');
  }

  // Image analysis
  setupImageAnalysis() {
    const analyzeBtn = document.getElementById('analyze-images-btn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => {
        this.showImageAnalysisModal();
      });
    }
  }

  showImageAnalysisModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Image Analysis Tools</h3>
        <div class="analysis-options">
          <button onclick="enhancedApp.findDuplicateImages()">Find Duplicate Images</button>
          <button onclick="enhancedApp.analyzeImageColors()">Analyze Image Colors</button>
          <button onclick="enhancedApp.generateMissingThumbnails()">Generate Missing Thumbnails</button>
        </div>
        <div id="analysis-results"></div>
        <button onclick="enhancedApp.closeModal()" class="close-btn">Close</button>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  async findDuplicateImages() {
    const resultsContainer = document.getElementById('analysis-results');
    resultsContainer.innerHTML = '<p>Scanning for duplicate images...</p>';

    try {
      // This would need to be implemented to get all image paths
      const imagePaths = await this.getAllImagePaths();
      
      const response = await fetch('/api/images/find-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePaths })
      });
      
      const duplicates = await response.json();
      
      if (duplicates.length === 0) {
        resultsContainer.innerHTML = '<p>No duplicate images found.</p>';
      } else {
        resultsContainer.innerHTML = `
          <h4>Found ${duplicates.length} potential duplicates:</h4>
          ${duplicates.map(dup => `
            <div class="duplicate-pair">
              <p>Similarity: ${(dup.similarity * 100).toFixed(1)}%</p>
              <p>Images: ${dup.image1} & ${dup.image2}</p>
            </div>
          `).join('')}
        `;
      }
    } catch (error) {
      console.error('Error finding duplicates:', error);
      resultsContainer.innerHTML = '<p>Error finding duplicates.</p>';
    }
  }

  // Backup management
  setupBackupManagement() {
    const backupBtn = document.getElementById('backup-btn');
    if (backupBtn) {
      backupBtn.addEventListener('click', () => {
        this.showBackupModal();
      });
    }
  }

  async showBackupModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Backup Management</h3>
        <div class="backup-actions">
          <button onclick="enhancedApp.createBackup()">Create New Backup</button>
          <button onclick="enhancedApp.exportDatabase()">Export Database</button>
          <button onclick="enhancedApp.loadBackupList()">View Existing Backups</button>
        </div>
        <div id="backup-results"></div>
        <button onclick="enhancedApp.closeModal()" class="close-btn">Close</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.loadBackupList();
  }

  async createBackup() {
    const resultsContainer = document.getElementById('backup-results');
    resultsContainer.innerHTML = '<p>Creating backup...</p>';

    try {
      const response = await fetch('/api/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeImages: true, compressionLevel: 6 })
      });
      
      const result = await response.json();
      
      if (result.success) {
        resultsContainer.innerHTML = `<p>Backup created successfully: ${result.backupPath}</p>`;
        this.loadBackupList(); // Refresh the list
      }
    } catch (error) {
      console.error('Error creating backup:', error);
      resultsContainer.innerHTML = '<p>Error creating backup.</p>';
    }
  }

  async loadBackupList() {
    try {
      const response = await fetch('/api/backup/list');
      const backups = await response.json();
      
      const resultsContainer = document.getElementById('backup-results');
      if (!resultsContainer) return;

      if (backups.length === 0) {
        resultsContainer.innerHTML = '<p>No backups found.</p>';
      } else {
        resultsContainer.innerHTML = `
          <h4>Existing Backups:</h4>
          <div class="backup-list">
            ${backups.map(backup => `
              <div class="backup-item">
                <span class="backup-name">${backup.name}</span>
                <span class="backup-size">${backup.humanSize}</span>
                <span class="backup-date">${new Date(backup.created).toLocaleDateString()}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (error) {
      console.error('Error loading backup list:', error);
    }
  }

  // Infinite scroll
  setupInfiniteScroll() {
    const container = document.getElementById('commission-grid');
    if (!container) return;

    let isLoading = false;
    let currentPage = 1;
    let hasMore = true;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isLoading && hasMore) {
        this.loadMoreCommissions(++currentPage);
      }
    });

    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    container.parentNode.appendChild(sentinel);
    observer.observe(sentinel);
  }

  async loadMoreCommissions(page) {
    // Implementation would depend on the existing pagination system
    console.log('Loading more commissions for page:', page);
  }

  // Drag and drop for reordering
  setupDragAndDrop() {
    const grids = document.querySelectorAll('.sortable-grid');
    
    grids.forEach(grid => {
      if (typeof Sortable !== 'undefined') {
        Sortable.create(grid, {
          animation: 150,
          ghostClass: 'sortable-ghost',
          onEnd: (evt) => {
            this.handleReorder(evt);
          }
        });
      }
    });
  }

  handleReorder(evt) {
    const itemId = evt.item.dataset.id;
    const newIndex = evt.newIndex;
    const oldIndex = evt.oldIndex;
    
    console.log(`Moved item ${itemId} from ${oldIndex} to ${newIndex}`);
    // Implementation would update the server with new order
  }

  // Utility methods
  async getAllImagePaths() {
    // This would need to be implemented based on your API
    return [];
  }

  closeModal() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.remove());
  }
}

// Initialize the enhanced app
let enhancedApp;
document.addEventListener('DOMContentLoaded', () => {
  enhancedApp = new EnhancedCommissionDB();
});