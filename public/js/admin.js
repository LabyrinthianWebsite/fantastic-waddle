// Admin Panel JavaScript

document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin panel loaded');
    
    // File upload handling
    setupFileUploads();
    
    // Form enhancements
    setupFormEnhancements();
    
    // Confirmation dialogs
    setupConfirmationDialogs();
    
    // Image managers
    setupImageManagers();
});

function setupFileUploads() {
    // Enhanced upload zones
    setupEnhancedUploadZones();
    
    // Legacy upload areas (for backward compatibility)
    const uploadAreas = document.querySelectorAll('.admin-upload-area');
    
    uploadAreas.forEach(area => {
        const input = area.querySelector('input[type="file"]');
        
        if (!input) return;
        
        area.addEventListener('click', () => input.click());
        
        area.addEventListener('dragover', (e) => {
            e.preventDefault();
            area.classList.add('dragover');
        });
        
        area.addEventListener('dragleave', () => {
            area.classList.remove('dragover');
        });
        
        area.addEventListener('drop', (e) => {
            e.preventDefault();
            area.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                input.files = files;
                updateUploadAreaText(area, files);
            }
        });
        
        input.addEventListener('change', () => {
            updateUploadAreaText(area, input.files);
        });
    });
}

function setupEnhancedUploadZones() {
    const uploadZones = document.querySelectorAll('.enhanced-upload-zone');
    
    uploadZones.forEach(zone => {
        const fileInput = zone.querySelector('input[type="file"]');
        const dropArea = zone.querySelector('.upload-drop-area');
        const previewContainer = zone.querySelector('.upload-preview-container');
        const previewGrid = zone.querySelector('.upload-preview-grid');
        const previewCount = zone.querySelector('.preview-count');
        const clearBtn = zone.querySelector('.clear-selection-btn');
        const addMoreBtn = zone.querySelector('.add-more-btn');
        const browseBtn = zone.querySelector('.upload-browse-btn');
        const imageType = zone.dataset.imageType;
        
        // Special handling for main image
        if (imageType === 'main') {
            setupMainImageUpload(zone, fileInput, dropArea, browseBtn);
            return;
        }
        
        let selectedFiles = new Map(); // Use Map to track files with IDs
        let fileCounter = 0;
        
        // Click handlers
        dropArea.addEventListener('click', () => fileInput.click());
        browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
        addMoreBtn?.addEventListener('click', () => fileInput.click());
        
        // Drag and drop handlers
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.classList.add('dragover');
        });
        
        dropArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!dropArea.contains(e.relatedTarget)) {
                dropArea.classList.remove('dragover');
            }
        });
        
        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.classList.remove('dragover');
            
            const files = Array.from(e.dataTransfer.files);
            addFilesToSelection(files);
        });
        
        // File input change handler
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            addFilesToSelection(files);
        });
        
        // Clear selection handler
        clearBtn?.addEventListener('click', () => {
            selectedFiles.clear();
            updatePreview();
            updateFileInput();
        });
        
        function addFilesToSelection(files) {
            files.forEach(file => {
                // Validate file
                if (validateFile(file, imageType)) {
                    const fileId = ++fileCounter;
                    selectedFiles.set(fileId, file);
                }
            });
            
            updatePreview();
            updateFileInput();
        }
        
        function removeFileFromSelection(fileId) {
            selectedFiles.delete(fileId);
            updatePreview();
            updateFileInput();
        }
        
        function updatePreview() {
            const files = Array.from(selectedFiles.values());
            
            if (files.length === 0) {
                if (previewContainer) previewContainer.style.display = 'none';
                return;
            }
            
            if (previewContainer) {
                previewContainer.style.display = 'block';
                if (previewCount) previewCount.textContent = files.length;
                
                // Clear existing previews
                if (previewGrid) previewGrid.innerHTML = '';
                
                // Create preview items
                selectedFiles.forEach((file, fileId) => {
                    const previewItem = createPreviewItem(file, fileId);
                    if (previewGrid) previewGrid.appendChild(previewItem);
                });
                
                updateValidationStatus();
            }
        }
        
        function createPreviewItem(file, fileId) {
            const item = document.createElement('div');
            item.className = 'upload-preview-item';
            item.dataset.fileId = fileId;
            
            const isImage = file.type.startsWith('image/');
            
            item.innerHTML = `
                ${isImage ? 
                    `<img class="upload-preview-image" src="${URL.createObjectURL(file)}" alt="${file.name}">` :
                    `<div class="upload-preview-file">${getFileIcon(file.name)}</div>`
                }
                <div class="upload-preview-info">
                    <p class="upload-preview-name" title="${file.name}">${file.name}</p>
                    <p class="upload-preview-size">${formatFileSize(file.size)}</p>
                </div>
                <button type="button" class="upload-preview-remove" title="Remove file">×</button>
            `;
            
            // Remove button handler
            const removeBtn = item.querySelector('.upload-preview-remove');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFileFromSelection(fileId);
            });
            
            return item;
        }
        
        function updateFileInput() {
            // Create a new FileList-like object for the file input
            const dt = new DataTransfer();
            selectedFiles.forEach(file => dt.items.add(file));
            fileInput.files = dt.files;
        }
        
        function updateValidationStatus() {
            const validationStatus = zone.querySelector('.validation-status');
            if (!validationStatus) return;
            
            const files = Array.from(selectedFiles.values());
            
            if (files.length === 0) {
                validationStatus.textContent = '';
                validationStatus.className = 'validation-status';
                return;
            }
            
            validationStatus.textContent = `${files.length} file${files.length !== 1 ? 's' : ''} selected`;
            validationStatus.className = 'validation-status valid';
        }
    });
}

function setupMainImageUpload(zone, fileInput, dropArea, browseBtn) {
    const previewContainer = zone.querySelector('.main-image-preview-container');
    const previewDisplay = zone.querySelector('.main-preview-display');
    const clearBtn = zone.querySelector('.clear-main-selection');
    
    // Click handlers
    dropArea.addEventListener('click', () => fileInput.click());
    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    
    // Drag and drop handlers
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('dragover');
    });
    
    dropArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (!dropArea.contains(e.relatedTarget)) {
            dropArea.classList.remove('dragover');
        }
    });
    
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleMainImageFile(files[0]);
        }
    });
    
    // File input change handler
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleMainImageFile(e.target.files[0]);
        }
    });
    
    // Clear button handler
    clearBtn?.addEventListener('click', () => {
        clearMainImageSelection();
    });
    
    function handleMainImageFile(file) {
        if (!validateFile(file, 'main')) return;
        
        // Create preview
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = file.name;
        img.onload = () => URL.revokeObjectURL(img.src);
        
        previewDisplay.innerHTML = '';
        previewDisplay.appendChild(img);
        previewContainer.style.display = 'block';
        
        // Update file input
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
    }
    
    function clearMainImageSelection() {
        previewContainer.style.display = 'none';
        previewDisplay.innerHTML = '';
        fileInput.value = '';
    }
}

function validateFile(file, imageType) {
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    
    if (file.size > maxSize) {
        alert(`File "${file.name}" is too large. Maximum size is 2GB.`);
        return false;
    }
    
    if (imageType !== 'files') {
        // For image types, validate that it's actually an image
        if (!file.type.startsWith('image/')) {
            alert(`File "${file.name}" is not a valid image.`);
            return false;
        }
        
        // Check for supported image types
        const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!supportedTypes.includes(file.type)) {
            alert(`File "${file.name}" is not a supported image format.`);
            return false;
        }
    }
    
    return true;
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    
    switch (ext) {
        case 'pdf': return '📄';
        case 'psd': return '🎨';
        case 'zip':
        case 'rar':
        case '7z': return '📦';
        case 'doc':
        case 'docx': return '📝';
        case 'txt': return '📋';
        case 'mp4':
        case 'mov':
        case 'avi': return '🎥';
        case 'mp3':
        case 'wav': return '🎵';
        default: return '📎';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Global function for main image preview (called from EJS template)
function showMainImagePreview(imagePath) {
    const modal = document.createElement('div');
    modal.className = 'image-preview-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="this.parentElement.remove()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <img src="/uploads/${imagePath}" alt="Main Image Preview" style="max-width: 90vw; max-height: 90vh; object-fit: contain;">
                <button class="modal-close" onclick="this.closest('.image-preview-modal').remove()">×</button>
            </div>
        </div>
    `;
    
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.8);
    `;
    
    const overlay = modal.querySelector('.modal-overlay');
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    const content = modal.querySelector('.modal-content');
    content.style.cssText = `
        position: relative;
        max-width: 90vw;
        max-height: 90vh;
    `;
    
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.style.cssText = `
        position: absolute;
        top: -40px;
        right: 0;
        background: none;
        border: none;
        color: white;
        font-size: 2rem;
        cursor: pointer;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    document.body.appendChild(modal);
}

function updateUploadAreaText(area, files) {
    const text = area.querySelector('.upload-text');
    if (text && files.length > 0) {
        text.textContent = `${files.length} file(s) selected`;
    }
}

function setupFormEnhancements() {
    // Auto-save drafts
    const forms = document.querySelectorAll('.admin-form, .commission-form');
    
    forms.forEach(form => {
        const inputs = form.querySelectorAll('input, textarea, select');
        
        inputs.forEach(input => {
            input.addEventListener('input', debounce(() => {
                saveDraft(form);
            }, 1000));
        });
    });
}

function setupConfirmationDialogs() {
    document.addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-confirm')) {
            const message = e.target.getAttribute('data-confirm');
            if (!confirm(message)) {
                e.preventDefault();
                return false;
            }
        }
    });
}

function saveDraft(form) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    const draftKey = `draft_${form.id || 'form'}`;
    localStorage.setItem(draftKey, JSON.stringify(data));
}

function loadDraft(formId) {
    const draftKey = `draft_${formId}`;
    const saved = localStorage.getItem(draftKey);
    
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('Error loading draft:', e);
        }
    }
    
    return null;
}

function debounce(func, wait) {
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

// Enhanced Image Management System with Slideshow
class ImageManager {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            commissionId: options.commissionId,
            imageType: options.imageType || 'gallery', // 'gallery', 'draft', 'files'
            apiBase: options.apiBase || '/admin/commissions',
            ...options
        };
        
        this.currentSlideIndex = 0;
        this.images = [];
        
        this.init();
    }
    
    init() {
        this.loadImages();
        this.setupSlideshow();
        this.setupThumbnailDragAndDrop();
        this.setupDeleteHandlers();
        this.setupPreviewHandlers();
        this.setupLegacyGridSupport();
    }
    
    loadImages() {
        const dataElements = this.container.querySelectorAll('.slideshow-data > div');
        this.images = Array.from(dataElements).map(el => ({
            id: el.dataset.imageId,
            index: parseInt(el.dataset.index),
            thumb: el.dataset.thumb,
            display: el.dataset.display,
            original: el.dataset.original,
            filename: el.dataset.filename
        }));
    }
    
    setupSlideshow() {
        const slideshowContainer = this.container.querySelector('.image-slideshow-container');
        if (!slideshowContainer) return;
        
        // Navigation buttons
        const prevBtn = slideshowContainer.querySelector('.slideshow-prev');
        const nextBtn = slideshowContainer.querySelector('.slideshow-next');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousSlide());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextSlide());
        }
        
        // Thumbnail navigation
        const thumbnails = slideshowContainer.querySelectorAll('.thumbnail-item');
        thumbnails.forEach((thumb, index) => {
            thumb.addEventListener('click', () => this.goToSlide(index));
        });
        
        // Keyboard navigation
        this.setupKeyboardNavigation();
        
        // Initialize active thumbnail
        this.updateActiveThumbnail();
        this.updateSlideshow();
    }
    
    setupKeyboardNavigation() {
        // Add keyboard navigation when slideshow is focused
        const slideshowViewer = this.container.querySelector('.slideshow-viewer');
        if (!slideshowViewer) return;
        
        slideshowViewer.setAttribute('tabindex', '0');
        slideshowViewer.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.previousSlide();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.nextSlide();
                    break;
                case 'Home':
                    e.preventDefault();
                    this.goToSlide(0);
                    break;
                case 'End':
                    e.preventDefault();
                    this.goToSlide(this.images.length - 1);
                    break;
                case ' ':
                case 'Enter':
                    e.preventDefault();
                    this.openFullPreview();
                    break;
            }
        });
    }
    
    previousSlide() {
        if (this.currentSlideIndex > 0) {
            this.currentSlideIndex--;
            this.updateSlideshow();
            this.updateActiveThumbnail();
            this.scrollThumbnailIntoView();
        }
    }
    
    nextSlide() {
        if (this.currentSlideIndex < this.images.length - 1) {
            this.currentSlideIndex++;
            this.updateSlideshow();
            this.updateActiveThumbnail();
            this.scrollThumbnailIntoView();
        }
    }
    
    goToSlide(index) {
        if (index >= 0 && index < this.images.length) {
            this.currentSlideIndex = index;
            this.updateSlideshow();
            this.updateActiveThumbnail();
            this.scrollThumbnailIntoView();
        }
    }
    
    updateSlideshow() {
        const mainImage = this.container.querySelector('.slideshow-main-image');
        const counter = this.container.querySelector('.slideshow-counter');
        const downloadLink = this.container.querySelector('.slideshow-actions .download-btn');
        
        if (!mainImage || this.images.length === 0) return;
        
        const currentImage = this.images[this.currentSlideIndex];
        
        // Update main image with smooth transition
        mainImage.style.opacity = '0.7';
        setTimeout(() => {
            mainImage.src = `/uploads/${currentImage.display}`;
            mainImage.alt = currentImage.filename;
            mainImage.style.opacity = '1';
        }, 150);
        
        // Update counter
        if (counter) {
            const currentSlideSpan = counter.querySelector('.current-slide');
            if (currentSlideSpan) {
                currentSlideSpan.textContent = this.currentSlideIndex + 1;
            }
        }
        
        // Update download link
        if (downloadLink && currentImage.original) {
            downloadLink.href = `/uploads/${currentImage.original}`;
        }
    }
    
    updateActiveThumbnail() {
        const thumbnails = this.container.querySelectorAll('.thumbnail-item');
        thumbnails.forEach((thumb, index) => {
            if (index === this.currentSlideIndex) {
                thumb.classList.add('active');
            } else {
                thumb.classList.remove('active');
            }
        });
    }
    
    scrollThumbnailIntoView() {
        const thumbnailStrip = this.container.querySelector('.thumbnail-strip');
        const activeThumbnail = this.container.querySelector('.thumbnail-item.active');
        
        if (thumbnailStrip && activeThumbnail) {
            const stripRect = thumbnailStrip.getBoundingClientRect();
            const thumbRect = activeThumbnail.getBoundingClientRect();
            
            if (thumbRect.left < stripRect.left || thumbRect.right > stripRect.right) {
                activeThumbnail.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            }
        }
    }
    
    openFullPreview() {
        if (this.images.length === 0) return;
        
        const currentImage = this.images[this.currentSlideIndex];
        this.showPreview(currentImage.display);
    }
    
    setupThumbnailDragAndDrop() {
        const thumbnailStrip = this.container.querySelector('.thumbnail-strip');
        if (!thumbnailStrip) return;
        
        let draggedElement = null;
        let placeholder = null;
        
        const thumbnails = thumbnailStrip.querySelectorAll('.thumbnail-item');
        thumbnails.forEach((thumb, index) => {
            // Make draggable via drag handle
            const dragHandle = thumb.querySelector('.drag-handle');
            if (dragHandle) {
                thumb.draggable = true;
                
                dragHandle.addEventListener('mousedown', () => {
                    thumb.draggable = true;
                });
                
                thumb.addEventListener('dragstart', (e) => {
                    draggedElement = thumb;
                    thumb.classList.add('dragging');
                    
                    // Create placeholder
                    placeholder = document.createElement('div');
                    placeholder.className = 'drag-placeholder-thumbnail';
                    placeholder.innerHTML = '<span style="color: var(--primary);">Drop here</span>';
                    
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/html', thumb.outerHTML);
                });
                
                thumb.addEventListener('dragend', () => {
                    thumb.classList.remove('dragging');
                    if (placeholder && placeholder.parentNode) {
                        placeholder.remove();
                    }
                    draggedElement = null;
                });
            }
        });
        
        // Setup drop zones
        thumbnailStrip.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (draggedElement) {
                const afterElement = this.getDragAfterElement(thumbnailStrip, e.clientX);
                if (afterElement == null) {
                    thumbnailStrip.appendChild(placeholder);
                } else {
                    thumbnailStrip.insertBefore(placeholder, afterElement);
                }
                placeholder.classList.add('visible');
            }
        });
        
        thumbnailStrip.addEventListener('drop', (e) => {
            e.preventDefault();
            
            if (draggedElement && placeholder.parentNode) {
                const draggedIndex = parseInt(draggedElement.dataset.imageIndex);
                placeholder.parentNode.insertBefore(draggedElement, placeholder);
                placeholder.remove();
                
                // Update order
                this.updateThumbnailOrder();
                this.updateSortOrder();
            }
        });
    }
    
    setupLegacyGridSupport() {
        // Support legacy grid view for backward compatibility
        const imageGrid = this.container.querySelector('.image-grid');
        if (!imageGrid) return;
        
        let draggedElement = null;
        let placeholder = null;
        
        const items = imageGrid.querySelectorAll('.image-item');
        items.forEach((item, index) => {
            item.draggable = true;
            item.dataset.index = index;
            
            item.addEventListener('dragstart', (e) => {
                draggedElement = item;
                item.classList.add('dragging');
                
                placeholder = document.createElement('div');
                placeholder.className = 'drag-placeholder';
                
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', item.outerHTML);
            });
            
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                if (placeholder && placeholder.parentNode) {
                    placeholder.remove();
                }
                draggedElement = null;
            });
            
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                if (draggedElement && draggedElement !== item) {
                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    
                    if (e.clientY < midY) {
                        item.parentNode.insertBefore(placeholder, item);
                    } else {
                        item.parentNode.insertBefore(placeholder, item.nextSibling);
                    }
                    placeholder.classList.add('visible');
                }
            });
            
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                
                if (draggedElement && draggedElement !== item) {
                    if (placeholder.parentNode) {
                        placeholder.parentNode.insertBefore(draggedElement, placeholder);
                        placeholder.remove();
                    }
                    
                    this.updateSortOrder();
                }
            });
        });
    }
    
    getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll('.thumbnail-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    updateThumbnailOrder() {
        const thumbnails = this.container.querySelectorAll('.thumbnail-item');
        thumbnails.forEach((thumb, index) => {
            thumb.dataset.imageIndex = index;
            const badge = thumb.querySelector('.thumbnail-order-badge');
            if (badge) {
                badge.textContent = index + 1;
            }
        });
        
        // Update images array order
        const newOrder = [];
        thumbnails.forEach(thumb => {
            const imageId = thumb.dataset.imageId;
            const image = this.images.find(img => img.id === imageId);
            if (image) {
                newOrder.push({ ...image, index: newOrder.length });
            }
        });
        this.images = newOrder;
    }
    
    previousSlide() {
        if (this.images.length <= 1) return;
        this.currentSlideIndex = (this.currentSlideIndex - 1 + this.images.length) % this.images.length;
        this.updateSlideshow();
    }
    
    nextSlide() {
        if (this.images.length <= 1) return;
        this.currentSlideIndex = (this.currentSlideIndex + 1) % this.images.length;
        this.updateSlideshow();
    }
    
    goToSlide(index) {
        if (index >= 0 && index < this.images.length) {
            this.currentSlideIndex = index;
            this.updateSlideshow();
        }
    }
    
    updateSlideshow() {
        if (this.images.length === 0) return;
        
        const mainImage = this.container.querySelector('.slideshow-main-image');
        const counter = this.container.querySelector('.slideshow-counter .current-slide');
        const downloadLink = this.container.querySelector('.slideshow-actions .download-btn');
        
        const currentImage = this.images[this.currentSlideIndex];
        
        if (mainImage && currentImage) {
            mainImage.src = `/uploads/${currentImage.display}`;
            mainImage.alt = currentImage.filename;
            mainImage.dataset.imageIndex = this.currentSlideIndex;
        }
        
        if (counter) {
            counter.textContent = this.currentSlideIndex + 1;
        }
        
        if (downloadLink && currentImage.original) {
            downloadLink.href = `/uploads/${currentImage.original}`;
        }
        
        this.updateActiveThumbnail();
    }
    
    updateActiveThumbnail() {
        const thumbnails = this.container.querySelectorAll('.thumbnail-item');
        thumbnails.forEach((thumb, index) => {
            if (index === this.currentSlideIndex) {
                thumb.classList.add('active');
            } else {
                thumb.classList.remove('active');
            }
        });
    }
    
    setupDeleteHandlers() {
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn') || e.target.classList.contains('thumbnail-delete-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                const imageItem = e.target.closest('.image-item, .file-item, .thumbnail-item');
                const imageId = imageItem.dataset.imageId;
                const fileName = imageItem.dataset.fileName || 'this item';
                
                if (confirm(`Are you sure you want to delete ${fileName}? This action cannot be undone.`)) {
                    this.deleteImage(imageId, imageItem);
                }
            }
            
            // Slideshow delete button
            if (e.target.closest('.slideshow-actions .delete-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                if (this.images.length > 0) {
                    const currentImage = this.images[this.currentSlideIndex];
                    if (confirm(`Are you sure you want to delete ${currentImage.filename}? This action cannot be undone.`)) {
                        this.deleteImage(currentImage.id);
                    }
                }
            }
        });
    }
    
    setupPreviewHandlers() {
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('preview-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                const imageItem = e.target.closest('.image-item');
                const imagePath = imageItem.dataset.imagePath;
                
                if (imagePath) {
                    this.showPreview(imagePath);
                }
            }
            
            // Slideshow preview button
            if (e.target.closest('.slideshow-actions .preview-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                if (this.images.length > 0) {
                    const currentImage = this.images[this.currentSlideIndex];
                    this.showPreview(currentImage.display);
                }
            }
        });
    }
    
    async deleteImage(imageId, imageElement) {
        if (imageElement) {
            imageElement.style.opacity = '0.5';
            imageElement.style.pointerEvents = 'none';
        }
        
        try {
            const response = await fetch(`${this.options.apiBase}/${this.options.commissionId}/${this.getEndpointSuffix()}/${imageId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete image');
            }
            
            // Remove from images array
            const imageIndex = this.images.findIndex(img => img.id === imageId);
            if (imageIndex !== -1) {
                this.images.splice(imageIndex, 1);
                
                // Adjust current slide index if necessary
                if (this.currentSlideIndex >= this.images.length) {
                    this.currentSlideIndex = Math.max(0, this.images.length - 1);
                }
                
                // Update slideshow
                if (this.images.length > 0) {
                    this.updateSlideshow();
                } else {
                    // Hide slideshow if no images left
                    const slideshowContainer = this.container.querySelector('.image-slideshow-container');
                    if (slideshowContainer) {
                        slideshowContainer.style.display = 'none';
                    }
                }
            }
            
            // Remove DOM element
            if (imageElement) {
                imageElement.style.transform = 'scale(0)';
                imageElement.style.transition = 'transform 0.3s ease';
                
                setTimeout(() => {
                    imageElement.remove();
                    this.updateCount();
                    this.updateThumbnailOrder();
                }, 300);
            } else {
                // Remove thumbnail if no specific element provided
                const thumbnailItem = this.container.querySelector(`[data-image-id="${imageId}"]`);
                if (thumbnailItem) {
                    thumbnailItem.remove();
                }
                this.updateCount();
                this.updateThumbnailOrder();
            }
            
            this.showToast('Image deleted successfully', 'success');
            
        } catch (error) {
            console.error('Error deleting image:', error);
            if (imageElement) {
                imageElement.style.opacity = '1';
                imageElement.style.pointerEvents = 'auto';
            }
            this.showToast('Failed to delete image', 'error');
        }
    }
    
    async updateSortOrder() {
        // Use thumbnails if available, otherwise fall back to legacy grid
        const thumbnails = this.container.querySelectorAll('.thumbnail-item');
        const items = thumbnails.length > 0 ? thumbnails : this.container.querySelectorAll('.image-item');
        const imageIds = Array.from(items).map(item => item.dataset.imageId);
        
        try {
            const response = await fetch(`${this.options.apiBase}/${this.options.commissionId}/${this.getEndpointSuffix()}/reorder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ imageIds })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update sort order');
            }
            
            // Update visual sort order indicators
            items.forEach((item, index) => {
                const sortIndicator = item.querySelector('.image-sort-order, .thumbnail-order-badge');
                if (sortIndicator) {
                    sortIndicator.textContent = index + 1;
                }
            });
            
            this.showToast('Order updated successfully', 'success');
        } catch (error) {
            console.error('Error updating sort order:', error);
            this.showToast('Failed to update order', 'error');
        }
    }
    
    getEndpointSuffix() {
        // For drafts, everything is just 'images'
        if (this.options.apiBase.includes('/drafts/')) {
            return 'images';
        }
        
        // For commissions, different types have different endpoints
        switch (this.options.imageType) {
            case 'draft':
                return 'draft-images';
            case 'files':
                return 'files';
            default:
                return 'images';
        }
    }
    
    updateCount() {
        const countElement = this.container.querySelector('.image-manager-count');
        if (countElement) {
            const items = this.container.querySelectorAll('.thumbnail-item, .image-item, .file-item');
            countElement.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
        }
    }
    
    showPreview(imagePath) {
        const modal = document.createElement('div');
        modal.className = 'image-preview-modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="this.parentElement.remove()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <img src="/uploads/${imagePath}" alt="Preview" style="max-width: 90vw; max-height: 90vh; object-fit: contain;">
                    <button class="modal-close" onclick="this.closest('.image-preview-modal').remove()">×</button>
                </div>
            </div>
        `;
        
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        const overlay = modal.querySelector('.modal-overlay');
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        const content = modal.querySelector('.modal-content');
        content.style.cssText = `
            position: relative;
            max-width: 90vw;
            max-height: 90vh;
        `;
        
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn.style.cssText = `
            position: absolute;
            top: -40px;
            right: 0;
            background: none;
            border: none;
            color: white;
            font-size: 2rem;
            cursor: pointer;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        document.body.appendChild(modal);
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `admin-toast admin-toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
            color: white;
            padding: 1rem;
            border-radius: 6px;
            z-index: 1001;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 100);
        
        // Auto remove
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize image managers
function setupImageManagers() {
    document.querySelectorAll('.image-manager').forEach(container => {
        const commissionId = container.dataset.commissionId;
        const imageType = container.dataset.imageType;
        
        // Determine API base from current URL
        let apiBase = '/admin/commissions';
        if (window.location.pathname.includes('/drafts/')) {
            apiBase = '/admin/drafts';
        }
        
        if (commissionId) {
            new ImageManager(container, {
                commissionId,
                imageType,
                apiBase
            });
        }
    });
}