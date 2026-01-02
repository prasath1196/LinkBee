// State
let allData = {};
let currentCollection = null;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    document.getElementById('refresh-btn').addEventListener('click', loadData);
    document.getElementById('clear-logs-btn').addEventListener('click', clearLogs);
    document.getElementById('clear-all-btn').addEventListener('click', clearAll);
});

async function loadData() {
    try {
        allData = await chrome.storage.local.get(null);
        renderSidebar();

        // If a collection was selected, re-render it. Otherwise select first.
        const keys = Object.keys(allData).sort();
        if (currentCollection && keys.includes(currentCollection)) {
            renderCollection(currentCollection);
        } else if (keys.length > 0) {
            renderCollection(keys[0]);
        }
    } catch (e) {
        alert("Error loading data: " + e.message);
    }
}

function renderSidebar() {
    const list = document.getElementById('collection-list');
    list.innerHTML = '';

    const keys = Object.keys(allData).sort();

    keys.forEach(key => {
        const value = allData[key];
        const isArray = Array.isArray(value);
        const count = isArray ? value.length : (typeof value === 'object' && value ? Object.keys(value).length : 1);

        const li = document.createElement('li');
        li.className = `collection-item ${currentCollection === key ? 'active' : ''}`;
        li.innerHTML = `
            <span>${key}</span>
            <span class="collection-count">${count}</span>
        `;
        li.addEventListener('click', () => {
            renderCollection(key);
            renderSidebar(); // Update active state
        });
        list.appendChild(li);
    });
}

function renderCollection(key) {
    currentCollection = key;
    document.getElementById('current-collection-name').textContent = key;

    const value = allData[key];
    const container = document.getElementById('data-view');
    container.innerHTML = '';

    // Check type
    if (Array.isArray(value)) {
        document.getElementById('doc-count').textContent = `1 - ${value.length} of ${value.length}`;
        if (value.length === 0) {
            container.innerHTML = '<div style="color:#94a3b8; padding:20px;">No documents found</div>';
            return;
        }

        // Render List of Cards
        value.forEach((item, index) => {
            renderDocumentCard(item, index, container);
        });

    } else if (typeof value === 'object' && value !== null) {
        document.getElementById('doc-count').textContent = 'Single Object';
        renderDocumentCard(value, 0, container, true);
    } else {
        document.getElementById('doc-count').textContent = 'Primitive Value';
        const card = document.createElement('div');
        card.className = 'document-card';
        card.style.padding = '20px';
        card.innerHTML = formatValue(value);
        container.appendChild(card);
    }
}

function renderDocumentCard(data, index, container, forceExpand = false) {
    const card = document.createElement('div');
    card.className = 'document-card';

    // Try to find a good ID or Title
    let title = `Document ${index}`;
    let subtitle = '';
    if (data && typeof data === 'object') {
        if (data.id) title = data.id;
        else if (data.conversationId) title = data.conversationId;
        else if (data.url) title = data.url;

        if (data.name) subtitle = data.name;
        else if (data.timestamp) subtitle = new Date(data.timestamp).toLocaleString();
    }

    const header = document.createElement('div');
    header.className = 'doc-header';
    header.innerHTML = `
        <span style="font-weight:600; color:#475569;">${escapeHtml(String(title))}</span>
        <span>${escapeHtml(String(subtitle))}</span>
    `;

    const body = document.createElement('div');
    body.className = 'doc-body';
    if (forceExpand) body.classList.add('expanded');

    // Render JSON Tree inside body
    const treeRoot = document.createElement('ul');
    treeRoot.className = 'json-tree';
    if (typeof data === 'object' && data !== null) {
        Object.keys(data).sort().forEach(k => {
            const li = document.createElement('li');
            renderJsonNode(k, data[k], li);
            treeRoot.appendChild(li);
        });
    } else {
        treeRoot.innerHTML = `<li>${formatValue(data)}</li>`;
    }
    body.appendChild(treeRoot);

    // Toggle
    header.addEventListener('click', () => {
        body.classList.toggle('expanded');
    });

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
}

function renderJsonNode(key, value, parentLi) {
    const isComplex = typeof value === 'object' && value !== null;
    const keySpan = `<span class="json-key">"${key}":</span> `;

    if (!isComplex) {
        parentLi.innerHTML = keySpan + formatValue(value);
        return;
    }

    const isArray = Array.isArray(value);
    const count = isArray ? value.length : Object.keys(value).length;

    const details = document.createElement('details');
    // Using native details/summary for nested items is simpler than custom collapsible
    const summary = document.createElement('summary');
    summary.style.cursor = 'pointer';
    summary.innerHTML = `${keySpan} <span style="color:#64748b; font-size:0.9em;">${isArray ? `Array(${count})` : 'Object'} {}</span>`;

    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.className = 'json-tree';

    Object.keys(value).sort().forEach(subKey => {
        const li = document.createElement('li');
        renderJsonNode(subKey, value[subKey], li);
        ul.appendChild(li);
    });

    details.appendChild(ul);
    parentLi.appendChild(details);
}

// Utils
function formatValue(value) {
    if (value === null) return '<span class="json-null">null</span>';
    if (typeof value === 'string') return `<span class="json-string">"${escapeHtml(value)}"</span>`;
    if (typeof value === 'number') return `<span class="json-number">${value}</span>`;
    if (typeof value === 'boolean') return `<span class="json-boolean">${value}</span>`;
    return String(value);
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

async function clearLogs() {
    if (!confirm("Clear analysis logs?")) return;
    await chrome.storage.local.remove('analysis_logs');
    loadData();
}

async function clearAll() {
    if (!confirm("WARNING: This will wipe ALL extension data. Continue?")) return;
    await chrome.storage.local.clear();
    loadData();
}
