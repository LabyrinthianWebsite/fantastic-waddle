const NodeCache = require('node-cache');

class CacheManager {
  constructor() {
    // Create different cache instances for different data types
    this.searchCache = new NodeCache({ 
      stdTTL: 300, // 5 minutes for search results
      checkperiod: 60, // Check for expired keys every minute
      maxKeys: 1000
    });
    
    this.statsCache = new NodeCache({ 
      stdTTL: 3600, // 1 hour for statistics
      checkperiod: 120,
      maxKeys: 100
    });
    
    this.imageCache = new NodeCache({ 
      stdTTL: 7200, // 2 hours for image metadata
      checkperiod: 300,
      maxKeys: 5000
    });
    
    this.userCache = new NodeCache({ 
      stdTTL: 1800, // 30 minutes for user preferences
      checkperiod: 60,
      maxKeys: 100
    });
  }

  // Search cache methods
  getSearchResult(key) {
    return this.searchCache.get(key);
  }

  setSearchResult(key, data) {
    return this.searchCache.set(key, data);
  }

  clearSearchCache() {
    this.searchCache.flushAll();
  }

  // Statistics cache methods
  getStats(key) {
    return this.statsCache.get(key);
  }

  setStats(key, data) {
    return this.statsCache.set(key, data);
  }

  clearStatsCache() {
    this.statsCache.flushAll();
  }

  // Image metadata cache methods
  getImageData(key) {
    return this.imageCache.get(key);
  }

  setImageData(key, data) {
    return this.imageCache.set(key, data);
  }

  clearImageCache() {
    this.imageCache.flushAll();
  }

  // User preferences cache methods
  getUserPrefs(userId) {
    return this.userCache.get(`user_${userId}`);
  }

  setUserPrefs(userId, data) {
    return this.userCache.set(`user_${userId}`, data);
  }

  clearUserCache(userId = null) {
    if (userId) {
      this.userCache.del(`user_${userId}`);
    } else {
      this.userCache.flushAll();
    }
  }

  // Utility methods
  generateSearchKey(query, filters, sort) {
    return `search_${JSON.stringify({ query, filters, sort })}`;
  }

  invalidateRelatedCaches(type) {
    switch (type) {
      case 'commission':
        this.clearSearchCache();
        this.clearStatsCache();
        break;
      case 'artist':
      case 'tag':
      case 'character':
        this.clearSearchCache();
        this.clearStatsCache();
        break;
      case 'image':
        this.clearImageCache();
        break;
    }
  }

  // Get cache statistics
  getCacheStats() {
    return {
      search: {
        keys: this.searchCache.keys().length,
        hits: this.searchCache.getStats().hits,
        misses: this.searchCache.getStats().misses
      },
      stats: {
        keys: this.statsCache.keys().length,
        hits: this.statsCache.getStats().hits,
        misses: this.statsCache.getStats().misses
      },
      images: {
        keys: this.imageCache.keys().length,
        hits: this.imageCache.getStats().hits,
        misses: this.imageCache.getStats().misses
      },
      users: {
        keys: this.userCache.keys().length,
        hits: this.userCache.getStats().hits,
        misses: this.userCache.getStats().misses
      }
    };
  }
}

module.exports = CacheManager;