// CommissionDB Frontend JavaScript

class CommissionDB {
  constructor() {
    this.init();
  }

  init() {
    this.setupThemeToggle();
    this.setupSafeModeToggle();
    this.setupKeyboardShortcuts();
    this.setupLightbox();
    this.setupModals();
    this.setupNSFWHandling();
    this.loadUserPreferences();
  }

  // Theme management
  setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle?.querySelector('.theme-icon');
    
    if (!themeToggle) return;

    themeToggle.addEventListener('click', () => {
      const body = document.body;
      const isDark = body.classList.contains('dark-theme');
      
      if (isDark) {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        themeIcon.textContent = '☀️';
        localStorage.setItem('theme', 'light');
      } else {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
        themeIcon.textContent = '🌙';
        localStorage.setItem('theme', 'dark');
      }
    });
  }

  // Safe Mode management
  setupSafeModeToggle() {
    const safeModeToggle = document.getElementById('safe-mode-toggle');
    const safeModeIcon = safeModeToggle?.querySelector('.safe-mode-icon');
    
    if (!safeModeToggle) return;

    safeModeToggle.addEventListener('click', () => {
      const isEnabled = document.body.classList.toggle('safe-mode-enabled');
      safeModeIcon.textContent = isEnabled ? '🔓' : '🔒';
      localStorage.setItem('safeMode', isEnabled);
      
      // Update NSFW content visibility
      this.updateNSFWVisibility(isEnabled);
    });
  }

  // NSFW content handling
  setupNSFWHandling() {
    // Add click-to-reveal functionality
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('nsfw-content')) {
        e.target.classList.toggle('revealed');
      }
    });
  }

  updateNSFWVisibility(safeModeEnabled) {
    const nsfwImages = document.querySelectorAll('.nsfw-content');
    nsfwImages.forEach(img => {
      if (safeModeEnabled) {
        img.classList.remove('revealed');
      }
    });
  }

  // Keyboard shortcuts
  setupKeyboardShortcuts() {
    let keySequence = '';
    let keyTimeout;

    document.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Don't process if modifiers are pressed (Ctrl, Alt, Cmd, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Single key shortcuts - handle immediately and return
      switch (e.key) {
        case '/':
          e.preventDefault();
          this.focusSearch();
          return;
        case '?':
          e.preventDefault();
          this.showKeyboardHelp();
          return;
        case 'Escape':
          this.closeModals();
          return;
        case 'ArrowLeft':
          if (this.lightbox && this.lightbox.isOpen) {
            e.preventDefault();
            this.lightbox.prev();
          }
          return;
        case 'ArrowRight':
          if (this.lightbox && this.lightbox.isOpen) {
            e.preventDefault();
            this.lightbox.next();
          }
          return;
      }

      // Only process letters for multi-key sequences
      if (!/^[a-z]$/i.test(e.key)) {
        return;
      }

      clearTimeout(keyTimeout);
      keySequence += e.key.toLowerCase();

      // Limit sequence length to prevent runaway sequences
      if (keySequence.length > 3) {
        keySequence = e.key.toLowerCase();
      }

      // Multi-key sequences with longer timeout for intentional typing
      keyTimeout = setTimeout(() => {
        this.handleKeySequence(keySequence);
        keySequence = '';
      }, 800);
    });
  }

  handleKeySequence(sequence) {
    // Only process valid 2-character sequences
    if (!sequence || sequence.length !== 2) {
      return;
    }

    switch (sequence) {
      case 'ga':
        window.location.href = '/artists';
        break;
      case 'gt':
        window.location.href = '/tags';
        break;
      case 'gc':
        window.location.href = '/characters';
        break;
      case 'gs':
        window.location.href = '/stats';
        break;
      case 'gh':
        window.location.href = '/';
        break;
      case 'gl':
        window.location.href = '/collections';
        break;
      // No default case - ignore unrecognized sequences
    }
  }

  focusSearch() {
    const searchInput = document.getElementById('main-search') || 
                       document.querySelector('.search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  showKeyboardHelp() {
    const modal = document.getElementById('keyboard-help-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  closeModals() {
    // Close keyboard help
    const keyboardModal = document.getElementById('keyboard-help-modal');
    if (keyboardModal) {
      keyboardModal.style.display = 'none';
    }

    // Close lightbox
    if (this.lightbox && this.lightbox.close) {
      this.lightbox.close();
    }

    // Close any other modals
    document.querySelectorAll('.modal').forEach(modal => {
      modal.style.display = 'none';
    });
  }

  // Lightbox functionality
  setupLightbox() {
    const lightboxElement = document.getElementById('lightbox');
    const lightboxImage = document.querySelector('.lightbox-image');
    const lightboxCaption = document.querySelector('.lightbox-filename');
    const lightboxOriginalLink = document.querySelector('.lightbox-original-link');
    
    // Only set up lightbox if all required elements exist
    if (!lightboxElement || !lightboxImage || !lightboxCaption || !lightboxOriginalLink) {
      this.lightbox = null;
      return;
    }

    this.lightbox = {
      element: lightboxElement,
      image: lightboxImage,
      caption: lightboxCaption,
      originalLink: lightboxOriginalLink,
      currentIndex: 0,
      images: [],
      isOpen: false,

      open: (images, startIndex = 0) => {
        this.lightbox.images = images;
        this.lightbox.currentIndex = startIndex;
        this.lightbox.isOpen = true;
        this.lightbox.show();
        this.lightbox.element.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      },

      close: () => {
        this.lightbox.isOpen = false;
        if (this.lightbox.element) {
          this.lightbox.element.style.display = 'none';
        }
        document.body.style.overflow = '';
      },

      show: () => {
        const current = this.lightbox.images[this.lightbox.currentIndex];
        if (!current) return;

        this.lightbox.image.src = current.display || current.src;
        this.lightbox.image.alt = current.alt || '';
        this.lightbox.caption.textContent = current.filename || '';
        
        if (current.original) {
          this.lightbox.originalLink.href = current.original;
          this.lightbox.originalLink.style.display = 'inline-block';
        } else {
          this.lightbox.originalLink.style.display = 'none';
        }
      },

      next: () => {
        if (this.lightbox.currentIndex < this.lightbox.images.length - 1) {
          this.lightbox.currentIndex++;
          this.lightbox.show();
        }
      },

      prev: () => {
        if (this.lightbox.currentIndex > 0) {
          this.lightbox.currentIndex--;
          this.lightbox.show();
        }
      }
    };

    // Setup lightbox event listeners
    if (this.lightbox.element) {
      // Close button
      const closeBtn = this.lightbox.element.querySelector('.lightbox-close');
      closeBtn?.addEventListener('click', () => this.lightbox.close());

      // Navigation buttons
      const nextBtn = this.lightbox.element.querySelector('.lightbox-next');
      const prevBtn = this.lightbox.element.querySelector('.lightbox-prev');
      nextBtn?.addEventListener('click', () => this.lightbox.next());
      prevBtn?.addEventListener('click', () => this.lightbox.prev());

      // Overlay click to close
      const overlay = this.lightbox.element.querySelector('.lightbox-overlay');
      overlay?.addEventListener('click', () => this.lightbox.close());
    }

    // Setup gallery triggers
    this.setupGalleryTriggers();
  }

  setupGalleryTriggers() {
    // Commission gallery images and main image
    document.addEventListener('click', (e) => {
      // Handle main image click
      if (e.target.classList.contains('main-image-display')) {
        e.preventDefault();
        
        // Collect all images on the page (main + gallery + drafts)
        const allImages = [];
        
        // Add main image first
        const mainImage = e.target;
        allImages.push({
          src: mainImage.src,
          display: mainImage.dataset.display || mainImage.src,
          original: mainImage.dataset.original || mainImage.src,
          filename: mainImage.dataset.filename || mainImage.alt,
          alt: mainImage.alt
        });
        
        // Add gallery images
        const galleryThumbs = document.querySelectorAll('.gallery-thumb');
        galleryThumbs.forEach(thumb => {
          allImages.push({
            src: thumb.src,
            display: thumb.dataset.display || thumb.src,
            original: thumb.dataset.original || thumb.src,
            filename: thumb.dataset.filename || thumb.alt,
            alt: thumb.alt
          });
        });
        
        // Add draft images
        const draftThumbs = document.querySelectorAll('.draft-thumb');
        draftThumbs.forEach(thumb => {
          allImages.push({
            src: thumb.src,
            display: thumb.dataset.display || thumb.src,
            original: thumb.dataset.original || thumb.src,
            filename: thumb.dataset.filename || thumb.alt,
            alt: thumb.alt
          });
        });
        
        // Open lightbox starting with main image (index 0)
        if (this.lightbox) {
          this.lightbox.open(allImages, 0);
        }
      }
      
      // Handle gallery and draft thumbnail clicks
      // Check if clicked on image directly or on wrapper div
      let targetImage = null;
      if (e.target.classList.contains('gallery-thumb') || 
          e.target.classList.contains('draft-thumb')) {
        targetImage = e.target;
      } else if (e.target.classList.contains('gallery-thumbnail-item') || 
                 e.target.classList.contains('drafts-thumbnail-item')) {
        // Clicked on wrapper div, find the image inside
        targetImage = e.target.querySelector('.gallery-thumb, .draft-thumb');
      }

      if (targetImage) {
        e.preventDefault();
        
        // Collect all images on the page (main + gallery + drafts)
        const allImages = [];
        
        // Add main image first (if exists)
        const mainImage = document.querySelector('.main-image-display');
        if (mainImage) {
          allImages.push({
            src: mainImage.src,
            display: mainImage.dataset.display || mainImage.src,
            original: mainImage.dataset.original || mainImage.src,
            filename: mainImage.dataset.filename || mainImage.alt,
            alt: mainImage.alt
          });
        }
        
        // Add gallery images
        const galleryThumbs = document.querySelectorAll('.gallery-thumb');
        galleryThumbs.forEach(thumb => {
          allImages.push({
            src: thumb.src,
            display: thumb.dataset.display || thumb.src,
            original: thumb.dataset.original || thumb.src,
            filename: thumb.dataset.filename || thumb.alt,
            alt: thumb.alt
          });
        });
        
        // Add draft images
        const draftThumbs = document.querySelectorAll('.draft-thumb');
        draftThumbs.forEach(thumb => {
          allImages.push({
            src: thumb.src,
            display: thumb.dataset.display || thumb.src,
            original: thumb.dataset.original || thumb.src,
            filename: thumb.dataset.filename || thumb.alt,
            alt: thumb.alt
          });
        });
        
        // Find the index of the clicked image in the combined array
        let clickedIndex = 0;
        const clickedSrc = targetImage.dataset.display || targetImage.src;
        
        for (let i = 0; i < allImages.length; i++) {
          if (allImages[i].display === clickedSrc || allImages[i].src === clickedSrc) {
            clickedIndex = i;
            break;
          }
        }
        
        if (this.lightbox) {
          this.lightbox.open(allImages, clickedIndex);
        }
      }
    });
  }

  // Modal management
  setupModals() {
    // Keyboard help modal
    const keyboardHelp = document.getElementById('keyboard-help');
    keyboardHelp?.addEventListener('click', () => this.showKeyboardHelp());

    // Close modal buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-close')) {
        e.target.closest('.modal').style.display = 'none';
      }
    });

    // Close modals on overlay click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
      }
    });
  }

  // Load user preferences
  loadUserPreferences() {
    // Load theme preference
    const savedTheme = localStorage.getItem('theme');
    const themeIcon = document.querySelector('.theme-icon');
    
    if (savedTheme === 'light') {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      if (themeIcon) themeIcon.textContent = '☀️';
    } else {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
      if (themeIcon) themeIcon.textContent = '🌙';
    }

    // Load safe mode preference
    const savedSafeMode = localStorage.getItem('safeMode') === 'true';
    const safeModeIcon = document.querySelector('.safe-mode-icon');
    
    if (savedSafeMode) {
      document.body.classList.add('safe-mode-enabled');
      if (safeModeIcon) safeModeIcon.textContent = '🔓';
    } else {
      if (safeModeIcon) safeModeIcon.textContent = '🔒';
    }
    
    this.updateNSFWVisibility(savedSafeMode);
  }

  // Utility methods
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // API helpers
  async fetchJSON(url, options = {}) {
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
  }

  // Search functionality
  setupSearch() {
    const searchInputs = document.querySelectorAll('.search-input');
    
    searchInputs.forEach(input => {
      const debouncedSearch = this.debounce(async (query) => {
        if (query.length < 2) return;
        
        const type = input.dataset.searchType || 'general';
        await this.performSearch(query, type);
      }, 300);

      input.addEventListener('input', (e) => {
        debouncedSearch(e.target.value);
      });
    });
  }

  async performSearch(query, type) {
    try {
      const response = await this.fetchJSON(`/api/search?type=${type}&q=${encodeURIComponent(query)}`);
      this.displaySearchResults(response, type);
    } catch (error) {
      console.error('Search error:', error);
    }
  }

  displaySearchResults(results, type) {
    const container = document.getElementById(`${type}-results`);
    if (!container) return;

    container.innerHTML = results.map(item => {
      switch (type) {
        case 'tags':
          return `
            <label class="tag-chip">
              <input type="checkbox" name="tags[]" value="${item.id}">
              <span class="tag-chip-text">${item.name} (${item.commission_count})</span>
            </label>
          `;
        case 'characters':
          return `
            <label class="character-chip">
              <input type="checkbox" name="character_ids[]" value="${item.id}">
              <div class="character-chip-content">
                <img 
                  src="${item.portrait_url || '/public/images/character-placeholder.jpg'}" 
                  alt="${item.name}" 
                  class="character-chip-image"
                >
                <span class="character-chip-text">${item.name} (${item.commission_count})</span>
              </div>
            </label>
          `;
        default:
          return `<div>${item.name}</div>`;
      }
    }).join('');
  }
}

// Animation utilities
class AnimationUtils {
  static fadeIn(element, duration = 300) {
    element.style.opacity = '0';
    element.style.display = 'block';
    
    let start = null;
    function animate(timestamp) {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      const opacity = Math.min(progress / duration, 1);
      
      element.style.opacity = opacity;
      
      if (progress < duration) {
        requestAnimationFrame(animate);
      }
    }
    
    requestAnimationFrame(animate);
  }

  static slideDown(element, duration = 300) {
    element.style.height = '0';
    element.style.overflow = 'hidden';
    element.style.display = 'block';
    
    const targetHeight = element.scrollHeight;
    let start = null;
    
    function animate(timestamp) {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      const height = Math.min((progress / duration) * targetHeight, targetHeight);
      
      element.style.height = height + 'px';
      
      if (progress < duration) {
        requestAnimationFrame(animate);
      } else {
        element.style.height = '';
        element.style.overflow = '';
      }
    }
    
    requestAnimationFrame(animate);
  }
}

// Form validation utilities
class FormValidator {
  static validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  static validateRequired(value) {
    return value && value.trim().length > 0;
  }

  static validateMinLength(value, minLength) {
    return value && value.length >= minLength;
  }

  static validateMaxLength(value, maxLength) {
    return !value || value.length <= maxLength;
  }

  static validateDateFormat(date) {
    const re = /^\d{4}-\d{2}$/;
    return re.test(date);
  }

  static validateScore(score) {
    const num = parseInt(score);
    return !isNaN(num) && num >= 0 && num <= 100;
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  window.commissionDB = new CommissionDB();
  
  // Add loading states to forms
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', function() {
      const submitBtn = this.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
      }
    });
  });

  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Image lazy loading enhancement
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src || img.src;
          img.classList.remove('lazy');
          observer.unobserve(img);
        }
      });
    });

    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      imageObserver.observe(img);
    });
  }
});

// Export for use in other modules
window.CommissionDB = CommissionDB;
window.AnimationUtils = AnimationUtils;
window.FormValidator = FormValidator;