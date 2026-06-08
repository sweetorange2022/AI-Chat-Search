// AI Chat Search - Webview Preview Script
// Implements a Ctrl+F-like search bar with highlighting, count, and navigation.
(function () {
  'use strict';
  var vscode = acquireVsCodeApi();

  // State
  var currentIndex = 0;
  var totalMatches = 0;
  var currentKeyword = '';
  var debounceTimer = null;

  // DOM Elements
  var searchBar = document.getElementById('search-bar');
  var searchInput = document.getElementById('search-input');
  var searchCount = document.getElementById('search-count');
  var btnPrev = document.getElementById('btn-prev');
  var btnNext = document.getElementById('btn-next');
  var btnClose = document.getElementById('btn-close');
  var contentEl = document.getElementById('content');

  // Notify extension ready
  vscode.postMessage({ command: 'ready' });

  // Listen for extension messages
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (msg.command === 'render') {
      contentEl.innerHTML = msg.html;
      clearHighlights();
      if (msg.keyword) {
        // Auto-open search bar with keyword pre-filled and highlight matches
        openSearchBar(msg.keyword);
      } else {
        hideSearchBar();
      }
    } else if (msg.command === 'search') {
      if (msg.keyword) {
        openSearchBar(msg.keyword);
      }
    } else if (msg.command === 'clear') {
      clearHighlights();
      hideSearchBar();
    }
  });

  // Search Bar Controls
  function openSearchBar(initialKeyword) {
    searchBar.classList.remove('hidden');
    if (initialKeyword) {
      searchInput.value = initialKeyword;
    }
    searchInput.focus();
    searchInput.select();
    if (searchInput.value.trim()) {
      performSearch(searchInput.value.trim());
    }
  }

  function hideSearchBar() {
    searchBar.classList.add('hidden');
    clearHighlights();
    searchInput.value = '';
    updateCount(0, 0);
    searchInput.classList.remove('no-match');
  }

  function updateCount(current, total) {
    if (total === 0) {
      searchCount.textContent = 'No results';
    } else {
      searchCount.textContent = (current + 1) + ' / ' + total;
    }
  }

  // Keyboard Shortcuts
  document.addEventListener('keydown', function (e) {
    // Ctrl+F / Cmd+F
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      if (searchBar.classList.contains('hidden')) {
        openSearchBar('');
      } else {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }
    // Escape
    if (e.key === 'Escape' && !searchBar.classList.contains('hidden')) {
      e.preventDefault();
      hideSearchBar();
      return;
    }
  });

  // Search Input Events
  searchInput.addEventListener('input', function () {
    if (debounceTimer) { clearTimeout(debounceTimer); }
    debounceTimer = setTimeout(function () {
      var kw = searchInput.value.trim();
      if (kw) {
        performSearch(kw);
      } else {
        clearHighlights();
        updateCount(0, 0);
        searchInput.classList.remove('no-match');
      }
    }, 100);
  });

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        jumpTo(currentIndex - 1);
      } else {
        jumpTo(currentIndex + 1);
      }
    }
  });

  // Button Events
  btnNext.addEventListener('click', function () { jumpTo(currentIndex + 1); });
  btnPrev.addEventListener('click', function () { jumpTo(currentIndex - 1); });
  btnClose.addEventListener('click', function () { hideSearchBar(); });

  // Search and Highlight
  function performSearch(kw) {
    clearHighlights();
    currentKeyword = kw;
    if (!kw) {
      updateCount(0, 0);
      searchInput.classList.remove('no-match');
      return;
    }

    var skipTags = new Set(['SCRIPT', 'STYLE', 'PRE', 'CODE']);
    var walker = document.createTreeWalker(
      contentEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (!node.textContent || !node.textContent.trim()) { return NodeFilter.FILTER_REJECT; }
          if (node.parentNode && skipTags.has(node.parentNode.tagName)) { return NodeFilter.FILTER_REJECT; }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    var textNodes = [];
    while (walker.nextNode()) { textNodes.push(walker.currentNode); }

    var escaped = escapeRegExp(kw);
    var regex = new RegExp(escaped, 'gi');

    textNodes.forEach(function (node) {
      var text = node.textContent;
      if (!regex.test(text)) { return; }
      regex.lastIndex = 0;

      var fragment = document.createDocumentFragment();
      var lastIndex = 0;
      var match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
        }
        var mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = match[0];
        fragment.appendChild(mark);
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
      }
      node.parentNode.replaceChild(fragment, node);
    });

    var all = document.querySelectorAll('.search-highlight');
    totalMatches = all.length;
    searchInput.classList.toggle('no-match', totalMatches === 0);

    if (totalMatches > 0) {
      jumpTo(0);
    } else {
      currentIndex = 0;
      updateCount(0, 0);
    }
  }

  function jumpTo(index) {
    var all = document.querySelectorAll('.search-highlight');
    if (all.length === 0) { return; }

    all.forEach(function (el) { el.classList.remove('active'); });

    if (index < 0) { index = all.length - 1; }
    if (index >= all.length) { index = 0; }
    currentIndex = index;

    var target = all[currentIndex];
    target.classList.add('active');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateCount(currentIndex, totalMatches);
  }

  function clearHighlights() {
    var highlights = document.querySelectorAll('.search-highlight');
    highlights.forEach(function (mark) {
      var parent = mark.parentNode;
      if (parent) {
        var text = document.createTextNode(mark.textContent);
        parent.replaceChild(text, mark);
        parent.normalize();
      }
    });
    currentIndex = 0;
    totalMatches = 0;
    currentKeyword = '';
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
})();