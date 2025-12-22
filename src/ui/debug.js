document.addEventListener('DOMContentLoaded', () => {
    loadData();
    document.getElementById('refresh-btn').addEventListener('click', loadData);
    document.getElementById('clear-logs-btn').addEventListener('click', clearLogs);
    document.getElementById('clear-all-btn').addEventListener('click', clearAll);
});

async function loadData() {
    const container = document.getElementById('json-container');
    container.innerHTML = "Fetching data...";

    try {
        const data = await chrome.storage.local.get(null);
        renderJson(data, container);
    } catch (e) {
        container.innerHTML = `<span style="color:red">Error: ${e.message}</span>`;
    }
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

function renderJson(data, container) {
    if (typeof data !== 'object' || data === null) {
        container.innerHTML = formatValue(data);
        return;
    }

    container.innerHTML = '';
    const rootList = document.createElement('ul');

    // Sort keys alphabetically for cleaner view
    const keys = Object.keys(data).sort();

    keys.forEach(key => {
        const li = document.createElement('li');
        const value = data[key];
        const isComplex = typeof value === 'object' && value !== null;

        const keySpan = document.createElement('span');
        keySpan.className = 'json-key';
        keySpan.textContent = `"${key}": `;
        li.appendChild(keySpan);

        if (isComplex) {
            const toggle = document.createElement('span');
            toggle.className = 'collapsible';
            toggle.onclick = function () {
                this.classList.toggle('collapsed');
            };

            // Special handling for Arrays
            if (Array.isArray(value)) {
                // Determine array preview
                const count = value.length;
                toggle.textContent = `Array(${count})`;
                li.insertBefore(toggle, keySpan.nextSibling); // Insert after key

                const ul = document.createElement('ul');
                value.forEach((item, index) => {
                    const childLi = document.createElement('li');

                    // Add index key for array items
                    const indexSpan = document.createElement('span');
                    indexSpan.style.color = '#64748b';
                    indexSpan.textContent = `${index}: `;
                    childLi.appendChild(indexSpan);

                    if (typeof item === 'object' && item !== null) {
                        renderObjectNode(item, childLi);
                    } else {
                        childLi.innerHTML += formatValue(item);
                    }
                    ul.appendChild(childLi);
                });
                li.appendChild(ul);
            } else {
                // Object
                toggle.textContent = 'Object';
                li.insertBefore(toggle, keySpan.nextSibling);

                const ul = document.createElement('ul');
                Object.keys(value).sort().forEach(childKey => {
                    const childLi = document.createElement('li');

                    const kSpan = document.createElement('span');
                    kSpan.className = 'json-key';
                    kSpan.textContent = `"${childKey}": `;
                    childLi.appendChild(kSpan);

                    if (typeof value[childKey] === 'object' && value[childKey] !== null) {
                        renderObjectNode(value[childKey], childLi);
                    } else {
                        childLi.innerHTML += formatValue(value[childKey]);
                    }
                    ul.appendChild(childLi);
                });
                li.appendChild(ul);
            }
        } else {
            li.innerHTML += formatValue(value);
        }

        rootList.appendChild(li);
    });

    container.appendChild(rootList);
}

function renderObjectNode(data, parentLi) {
    if (typeof data !== 'object' || data === null) {
        parentLi.innerHTML += formatValue(data);
        return;
    }

    const isArray = Array.isArray(data);
    const toggle = document.createElement('span');
    toggle.className = 'collapsible collapsed'; // Default collapsed for nested
    toggle.textContent = isArray ? `Array(${data.length})` : 'Object';

    toggle.onclick = function () {
        this.classList.toggle('collapsed');
    };

    parentLi.appendChild(toggle);

    const ul = document.createElement('ul');
    // Start collapsed
    // toggle.classList.add('collapsed'); // Already added in className above

    const keys = Object.keys(data).sort();
    keys.forEach(key => {
        const li = document.createElement('li');

        const keySpan = document.createElement('span');
        keySpan.className = 'json-key';
        keySpan.textContent = isArray ? `${key}: ` : `"${key}": `; // No quotes for array indices
        if (isArray) keySpan.style.color = '#64748b';

        li.appendChild(keySpan);

        const value = data[key];
        if (typeof value === 'object' && value !== null) {
            renderObjectNode(value, li);
        } else {
            li.innerHTML += formatValue(value);
        }
        ul.appendChild(li);
    });

    parentLi.appendChild(ul);
}

function formatValue(value) {
    if (value === null) return '<span class="json-null">null</span>';
    if (typeof value === 'string') return `<span class="json-string">"${escapeHtml(value)}"</span>`;
    if (typeof value === 'number') return `<span class="json-number">${value}</span>`;
    if (typeof value === 'boolean') return `<span class="json-boolean">${value}</span>`;
    return String(value);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function (m) { return map[m]; });
}
