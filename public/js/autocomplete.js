/**
 * Autocomplete Component for Artists and Characters
 * Supports typeahead suggestions, creating new entities, and multiple selections
 */
class AutocompleteManager {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            type: options.type || 'artist', // 'artist' or 'character'
            multiple: options.multiple || false,
            placeholder: options.placeholder || 'Start typing to search...',
            createText: options.createText || 'Create new',
            apiEndpoint: options.apiEndpoint || '/api/suggest',
            minLength: options.minLength || 1,
            maxResults: options.maxResults || 10,
            selectedValues: options.selectedValues || [],
            onSelect: options.onSelect || (() => {}),
            onCreate: options.onCreate || (() => {}),
            ...options
        };
        
        this.selectedItems = new Map();
        this.isOpen = false;
        this.currentFocus = -1;
        
        this.init();
    }
    
    init() {
        this.createStructure();
        this.bindEvents();
        
        // Initialize with pre-selected values
        if (this.options.selectedValues.length > 0) {
            this.loadInitialSelections();
        }
    }
    
    createStructure() {
        this.container.innerHTML = `
            <div class="autocomplete-wrapper">
                <div class="autocomplete-input-container">
                    <input type="text" 
                           class="autocomplete-input" 
                           placeholder="${this.options.placeholder}"
                           autocomplete="off">
                    <div class="autocomplete-selected-items"></div>
                </div>
                <div class="autocomplete-dropdown" style="display: none;">
                    <div class="autocomplete-results"></div>
                </div>
                <div class="autocomplete-hidden-inputs"></div>
            </div>
        `;
        
        this.input = this.container.querySelector('.autocomplete-input');
        this.dropdown = this.container.querySelector('.autocomplete-dropdown');
        this.results = this.container.querySelector('.autocomplete-results');
        this.selectedContainer = this.container.querySelector('.autocomplete-selected-items');
        this.hiddenInputsContainer = this.container.querySelector('.autocomplete-hidden-inputs');
        
        // Add CSS styles
        this.addStyles();
    }
    
    addStyles() {
        if (document.getElementById('autocomplete-styles')) return;
        
        const styles = `
            <style id="autocomplete-styles">
                .autocomplete-wrapper {
                    position: relative;
                    width: 100%;
                }
                
                .autocomplete-input-container {
                    position: relative;
                    border: 1px solid #444;
                    border-radius: 4px;
                    background: #2a2a2a;
                    min-height: 38px;
                    padding: 4px;
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 4px;
                }
                
                .autocomplete-input {
                    border: none;
                    background: transparent;
                    color: #fff;
                    outline: none;
                    flex: 1;
                    min-width: 120px;
                    padding: 6px;
                    font-size: 14px;
                }
                
                .autocomplete-input::placeholder {
                    color: #888;
                }
                
                .autocomplete-selected-items {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }
                
                .autocomplete-selected-item {
                    background: #0066cc;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 16px;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .autocomplete-selected-item .remove-btn {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    padding: 0;
                    width: 14px;
                    height: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    font-size: 12px;
                }
                
                .autocomplete-selected-item .remove-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
                
                .autocomplete-dropdown {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: #333;
                    border: 1px solid #444;
                    border-top: none;
                    border-radius: 0 0 4px 4px;
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 1000;
                }
                
                .autocomplete-result-item {
                    padding: 8px 12px;
                    cursor: pointer;
                    color: #fff;
                    border-bottom: 1px solid #444;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .autocomplete-result-item:last-child {
                    border-bottom: none;
                }
                
                .autocomplete-result-item:hover,
                .autocomplete-result-item.focused {
                    background: #0066cc;
                }
                
                .autocomplete-result-item.create-new {
                    background: #28a745;
                    font-weight: bold;
                }
                
                .autocomplete-result-item.create-new:hover {
                    background: #218838;
                }
                
                .autocomplete-result-type {
                    font-size: 11px;
                    color: #888;
                    background: #555;
                    padding: 2px 6px;
                    border-radius: 10px;
                }
                
                .autocomplete-no-results {
                    padding: 8px 12px;
                    color: #888;
                    font-style: italic;
                }
                
                .autocomplete-loading {
                    padding: 8px 12px;
                    color: #888;
                    text-align: center;
                }
                
                .autocomplete-hidden-inputs {
                    display: none;
                }
            </style>
        `;
        
        document.head.insertAdjacentHTML('beforeend', styles);
    }
    
    bindEvents() {
        // Input events
        this.input.addEventListener('input', (e) => this.handleInput(e));
        this.input.addEventListener('focus', (e) => this.handleFocus(e));
        this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Outside click
        document.addEventListener('click', (e) => this.handleOutsideClick(e));
        
        // Results events
        this.results.addEventListener('click', (e) => this.handleResultClick(e));
    }
    
    async handleInput(e) {
        const query = e.target.value.trim();
        
        if (query.length < this.options.minLength) {
            this.hideDropdown();
            return;
        }
        
        await this.searchItems(query);
    }
    
    handleFocus(e) {
        if (this.input.value.trim().length >= this.options.minLength) {
            this.searchItems(this.input.value.trim());
        }
    }
    
    handleKeydown(e) {
        if (!this.isOpen) return;
        
        const items = this.results.querySelectorAll('.autocomplete-result-item');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.currentFocus = Math.min(this.currentFocus + 1, items.length - 1);
                this.updateFocus(items);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.currentFocus = Math.max(this.currentFocus - 1, -1);
                this.updateFocus(items);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.currentFocus >= 0 && items[this.currentFocus]) {
                    this.selectItem(items[this.currentFocus]);
                }
                break;
            case 'Escape':
                this.hideDropdown();
                break;
        }
    }
    
    updateFocus(items) {
        items.forEach((item, index) => {
            item.classList.toggle('focused', index === this.currentFocus);
        });
    }
    
    handleOutsideClick(e) {
        if (!this.container.contains(e.target)) {
            this.hideDropdown();
        }
    }
    
    handleResultClick(e) {
        const item = e.target.closest('.autocomplete-result-item');
        if (item) {
            this.selectItem(item);
        }
    }
    
    async searchItems(query) {
        this.showLoading();
        
        try {
            const response = await fetch(`${this.options.apiEndpoint}?type=${this.options.type}&q=${encodeURIComponent(query)}&take=${this.options.maxResults}`);
            const items = await response.json();
            
            this.renderResults(items, query);
        } catch (error) {
            console.error('Search error:', error);
            this.showError('Error searching items');
        }
    }
    
    renderResults(items, query) {
        this.results.innerHTML = '';
        
        // Filter out already selected items
        const availableItems = items.filter(item => !this.selectedItems.has(item.id));
        
        if (availableItems.length === 0 && query) {
            this.results.innerHTML = `
                <div class="autocomplete-result-item create-new" data-action="create" data-query="${query}">
                    <span>${this.options.createText}: "${query}"</span>
                    <span class="autocomplete-result-type">New</span>
                </div>
            `;
        } else {
            // Add existing items
            availableItems.forEach(item => {
                const div = document.createElement('div');
                div.className = 'autocomplete-result-item';
                div.setAttribute('data-id', item.id);
                div.setAttribute('data-name', item.name);
                div.innerHTML = `
                    <span>${item.name}</span>
                    <span class="autocomplete-result-type">${this.options.type}</span>
                `;
                this.results.appendChild(div);
            });
            
            // Add create new option if there's a query
            if (query && !availableItems.some(item => item.name.toLowerCase() === query.toLowerCase())) {
                const div = document.createElement('div');
                div.className = 'autocomplete-result-item create-new';
                div.setAttribute('data-action', 'create');
                div.setAttribute('data-query', query);
                div.innerHTML = `
                    <span>${this.options.createText}: "${query}"</span>
                    <span class="autocomplete-result-type">New</span>
                `;
                this.results.appendChild(div);
            }
        }
        
        this.showDropdown();
        this.currentFocus = -1;
    }
    
    showLoading() {
        this.results.innerHTML = '<div class="autocomplete-loading">Searching...</div>';
        this.showDropdown();
    }
    
    showError(message) {
        this.results.innerHTML = `<div class="autocomplete-no-results">${message}</div>`;
        this.showDropdown();
    }
    
    showDropdown() {
        this.dropdown.style.display = 'block';
        this.isOpen = true;
    }
    
    hideDropdown() {
        this.dropdown.style.display = 'none';
        this.isOpen = false;
        this.currentFocus = -1;
    }
    
    selectItem(element) {
        const action = element.getAttribute('data-action');
        
        if (action === 'create') {
            this.createNewItem(element.getAttribute('data-query'));
        } else {
            const id = element.getAttribute('data-id');
            const name = element.getAttribute('data-name');
            this.addSelectedItem(id, name);
        }
        
        this.input.value = '';
        this.hideDropdown();
    }
    
    async createNewItem(name) {
        try {
            // Show a simple prompt for now - this could be enhanced with a modal
            const confirmed = confirm(`Create new ${this.options.type} "${name}"?`);
            if (!confirmed) return;
            
            // For now, we'll add it with a temporary ID and let the backend handle it
            // In a full implementation, this would make an API call to create the item
            const tempId = `new_${Date.now()}`;
            this.addSelectedItem(tempId, name, true);
            
            this.options.onCreate(name, this.options.type);
        } catch (error) {
            console.error('Error creating item:', error);
            alert('Error creating new item');
        }
    }
    
    addSelectedItem(id, name, isNew = false) {
        if (this.selectedItems.has(id)) return;
        
        this.selectedItems.set(id, { name, isNew });
        
        if (this.options.multiple) {
            this.renderSelectedItems();
        } else {
            // For single selection, clear previous and set new
            this.selectedItems.clear();
            this.selectedItems.set(id, { name, isNew });
            this.renderSelectedItems();
        }
        
        this.updateHiddenInputs();
        this.options.onSelect(id, name, isNew);
    }
    
    removeSelectedItem(id) {
        this.selectedItems.delete(id);
        this.renderSelectedItems();
        this.updateHiddenInputs();
    }
    
    renderSelectedItems() {
        this.selectedContainer.innerHTML = '';
        
        this.selectedItems.forEach((item, id) => {
            const div = document.createElement('div');
            div.className = 'autocomplete-selected-item';
            div.innerHTML = `
                <span>${item.name}${item.isNew ? ' (new)' : ''}</span>
                <button type="button" class="remove-btn" data-id="${id}">×</button>
            `;
            
            div.querySelector('.remove-btn').addEventListener('click', () => {
                this.removeSelectedItem(id);
            });
            
            this.selectedContainer.appendChild(div);
        });
        
        // Show/hide input based on selection mode
        if (!this.options.multiple && this.selectedItems.size > 0) {
            this.input.style.display = 'none';
        } else {
            this.input.style.display = 'block';
        }
    }
    
    updateHiddenInputs() {
        this.hiddenInputsContainer.innerHTML = '';
        
        // Add hidden inputs for form submission
        this.selectedItems.forEach((item, id) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = this.options.multiple ? `${this.options.type}_ids` : `${this.options.type}_id`;
            input.value = item.isNew ? `new:${item.name}` : id;
            this.hiddenInputsContainer.appendChild(input);
        });
    }
    
    async loadInitialSelections() {
        // Load initial selections if provided
        for (const item of this.options.selectedValues) {
            this.addSelectedItem(item.id, item.name);
        }
    }
    
    // Public methods
    getSelectedItems() {
        return Array.from(this.selectedItems.entries()).map(([id, item]) => ({
            id,
            name: item.name,
            isNew: item.isNew
        }));
    }
    
    clear() {
        this.selectedItems.clear();
        this.renderSelectedItems();
        this.updateHiddenInputs();
    }
    
    setValue(items) {
        this.clear();
        items.forEach(item => {
            this.addSelectedItem(item.id, item.name, item.isNew || false);
        });
    }
}

// Initialize autocomplete components on page load
document.addEventListener('DOMContentLoaded', function() {
    // Auto-initialize autocomplete components with data attributes
    document.querySelectorAll('[data-autocomplete]').forEach(element => {
        const options = {
            type: element.dataset.autocomplete,
            multiple: element.hasAttribute('data-multiple'),
            placeholder: element.dataset.placeholder || 'Start typing to search...',
        };
        
        // Get initial values from existing select element if present
        const existingSelect = element.querySelector('select');
        if (existingSelect) {
            options.selectedValues = Array.from(existingSelect.selectedOptions).map(option => ({
                id: option.value,
                name: option.textContent.trim()
            })).filter(item => item.id);
            
            // Hide the original select
            existingSelect.style.display = 'none';
        }
        
        new AutocompleteManager(element, options);
    });
});