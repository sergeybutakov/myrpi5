function formatBytes(bytes, decimals = 0) {
    if (bytes === 0) return '0B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + sizes[i];
}

const fanAnimations = {};
const scale = 50;
let updateInterval = 1000;

function animateFan(iconId, rpmValue) {
    const icon = document.getElementById(iconId);
    if (!icon) return;
    let rpm = parseInt(rpmValue, 10);
    if (isNaN(rpm) || rpm <= 0) {
        if (fanAnimations[iconId] && fanAnimations[iconId].rafId) {
            cancelAnimationFrame(fanAnimations[iconId].rafId);
            fanAnimations[iconId] = null;
        }
        icon.style.transform = 'rotate(0deg)';
        return;
    }
    if (fanAnimations[iconId]) {
        fanAnimations[iconId].rpm = rpm;
        return;
    }
    fanAnimations[iconId] = {
        angle: 0,
        lastTimestamp: null,
        rpm: rpm,
        rafId: null
    };
    function step(timestamp) {
        const state = fanAnimations[iconId];
        if (!state) return;
        if (state.lastTimestamp === null) state.lastTimestamp = timestamp;
        const delta = (timestamp - state.lastTimestamp) / 1000;
        state.lastTimestamp = timestamp;
        const visualRpm = state.rpm / scale;
        const degreesPerSecond = (visualRpm / 60) * 360;
        state.angle = (state.angle + degreesPerSecond * delta) % 360;
        icon.style.transform = `rotate(${state.angle}deg)`;
        state.rafId = requestAnimationFrame(step);
    }
    fanAnimations[iconId].rafId = requestAnimationFrame(step);
}

const thermometerSVGs = {
    low: `<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" fill="currentColor" class="bi bi-thermometer-low" viewBox="0 0 16 16"><path d="M9.5 12.5a1.5 1.5 0 1 1-2-1.415V9.5a.5.5 0 0 1 1 0v1.585a1.5 1.5 0 0 1 1 1.415"/><path d="M5.5 2.5a2.5 2.5 0 0 1 5 0v7.55a3.5 3.5 0 1 1-5 0zM8 1a1.5 1.5 0 0 0-1.5 1.5v7.987l-.167.15a2.5 2.5 0 1 0 3.333 0l-.166-.15V2.5A1.5 1.5 0 0 0 8 1"/></svg>`,
    half: `<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" fill="currentColor" class="bi bi-thermometer-half" viewBox="0 0 16 16"><path d="M9.5 12.5a1.5 1.5 0 1 1-2-1.415V6.5a.5.5 0 0 1 1 0v4.585a1.5 1.5 0 0 1 1 1.415"/><path d="M5.5 2.5a2.5 2.5 0 0 1 5 0v7.55a3.5 3.5 0 1 1-5 0zM8 1a1.5 1.5 0 0 0-1.5 1.5v7.987l-.167.15a2.5 2.5 0 1 0 3.333 0l-.166-.15V2.5A1.5 1.5 0 0 0 8 1"/></svg>`,
    high: `<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" fill="currentColor" class="bi bi-thermometer-high" viewBox="0 0 16 16"><path d="M9.5 12.5a1.5 1.5 0 1 1-2-1.415V2.5a.5.5 0 0 1 1 0v8.585a1.5 1.5 0 0 1 1 1.415"/><path d="M5.5 2.5a2.5 2.5 0 0 1 5 0v7.55a3.5 3.5 0 1 1-5 0zM8 1a1.5 1.5 0 0 0-1.5 1.5v7.987l-.167.15a2.5 2.5 0 1 0 3.333 0l-.166-.15V2.5A1.5 1.5 0 0 0 8 1"/></svg>`
};

const gradientConfigs = {
    low: { colors: ['#2193b0', '#6dd5ed'], class: 'state-low' },
    middle: { colors: ['#f2994a', '#f2c94c'], class: 'state-middle' },
    high: { colors: ['#ff416c', '#ff4b2b'], class: 'state-high' }
};

let currentGradientState = '';

function getTempStateKey(temp, source) {
    if (source === 'CPU') {
        if (temp <= 55) return 'low';
        if (temp <= 70) return 'middle';
        return 'high';
    }
    // Логика для других датчиков
    if (source === 'NVME') {
        if (temp <= 35) return 'low';
        if (temp <= 50) return 'middle';
        return 'high';
    }
    if (source === 'RP1') {
        if (temp <= 52) return 'low';
        if (temp <= 60) return 'middle';
        return 'high';
    }
    return 'middle'; // Возвращаем 'middle' вместо 'half'
}

function setThermoIcon(id, temp, source) {
    const iconContainer = document.getElementById(id);
    if (!iconContainer) return;
    const key = getTempStateKey(temp, source);
    iconContainer.innerHTML = thermometerSVGs[key === 'middle' ? 'half' : key];
}

function updateData() {
    fetch('/api/data')
        .then(response => response.json())
        .then(data => {
            const cpuTemp = data['CPU'];

            if (cpuTemp !== undefined) {
                const newStateKey = getTempStateKey(cpuTemp, 'CPU');
                if (newStateKey !== currentGradientState) {
                    currentGradientState = newStateKey;
                    const config = gradientConfigs[newStateKey];

                    document.body.style.setProperty('--grad-color-1', config.colors[0]);
                    document.body.style.setProperty('--grad-color-2', config.colors[1]);

                    document.body.classList.remove('state-low', 'state-middle', 'state-high');
                    document.body.classList.add(config.class);
                }
            }

            const nvmeTemp = data['NVME'];
            const rp1Temp = data['RP1'];

            document.getElementById('nvme').textContent = (nvmeTemp !== undefined ? Math.round(nvmeTemp) + '°C' : '-');
            document.getElementById('cpu').textContent = (cpuTemp !== undefined ? Math.round(cpuTemp) + '°C' : '-');
            document.getElementById('rp1').textContent = (rp1Temp !== undefined ? Math.round(rp1Temp) + '°C' : '-');

            if (nvmeTemp !== undefined) setThermoIcon('nvme-icon', nvmeTemp, 'NVME');
            if (cpuTemp !== undefined) setThermoIcon('cpu-icon', cpuTemp, 'CPU');
            if (rp1Temp !== undefined) setThermoIcon('rp1-icon', rp1Temp, 'RP1');

            const noctuaRpm = (data['Noctua A4x10'] !== undefined ? data['Noctua A4x10'] : null);
            const systemFanRpm = (data['System Fan'] !== undefined ? data['System Fan'] : null);

            document.getElementById('noctua').textContent = (noctuaRpm !== undefined && noctuaRpm !== null ? noctuaRpm + ' RPM' : '-');
            document.getElementById('system_fan').textContent = (systemFanRpm !== undefined && systemFanRpm !== null ? systemFanRpm + ' RPM' : '-');
            animateFan('fan-rpi5-icon', systemFanRpm);
            animateFan('fan-noctua-icon', noctuaRpm);

            if ('power_status' in data) {
                const el = document.getElementById('power-status');
                if (el) {
                    el.className = 'badge rounded-pill'; // Сброс классов
                    if (data['power_status'] === 'power ok') {
                        el.textContent = 'Power OK';
                        el.classList.add('text-white');
                    } else if (data['power_status'] === 'low power') {
                        el.textContent = 'Low Power';
                        el.classList.add('text-white');
                    } else {
                        el.textContent = 'N/A';
                        el.classList.add('text-white');
                    }
                }
            }

            if ('mem_used' in data && 'mem_total' in data && 'mem_percent' in data) {
                const memUsedMB = Math.round(data['mem_used'] / (1024 * 1024)) + 'M';
                const memTotalMB = Math.round(data['mem_total'] / (1024 * 1024)) + 'M';
                document.getElementById('mem_percent').textContent = data['mem_percent'] + '%';
                document.getElementById('mem_detail').textContent = memUsedMB + ' / ' + memTotalMB;
            }

            if ('disk_percent' in data) {
                document.getElementById('disk_percent').textContent = data['disk_percent'] + '%';
                let diskUsed = formatBytes(data['disk_used'], 0);
                let diskTotal = formatBytes(data['disk_total'], 0);
                document.getElementById('disk_detail').textContent = `${diskUsed.replace(' ', '')} / ${diskTotal.replace(' ', '')}`;
            }

            document.getElementById('cpu_usage').textContent = (data['CPU_Usage'] !== undefined ? data['CPU_Usage'] + '%' : '-');
            document.getElementById('last-update').innerHTML = ' ' + (data['Uptime'] || 'N/A');

            if ('process_count' in data) document.getElementById('process-count').textContent = `(${data['process_count']})`;
            if ('total_containers' in data) document.getElementById('container-count').textContent = `(${data['total_containers']})`;

            if ('top_tasks' in data) {
                const tbody = document.querySelector('#tasks-table tbody');
                if (tbody) {
                    tbody.innerHTML = '';
                    data.top_tasks.forEach(proc => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `<td>${proc.pid}</td><td>${proc.cmd}</td><td>${proc.cpu}</td><td>${proc.mem}M</td>`;
                        tbody.appendChild(tr);
                    });
                }
            }
            if ('top_containers' in data) {
                const tbody = document.querySelector('#docker-table tbody');
                if (tbody) {
                    tbody.innerHTML = '';
                    data.top_containers.forEach(cont => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `<td>${cont.id || '-'}</td><td>${cont.name}</td><td>${(cont.cpu !== undefined) ? cont.cpu.toFixed(1) : '-'}</td><td>${(cont.mem !== undefined) ? cont.mem.toFixed(0) + 'M' : '-'}</td>`;
                        tbody.appendChild(tr);
                    });
                }
            }
        })
        .catch(error => console.error('Ошибка обновления данных:', error));
}

function setUpdateInterval(interval) {
    updateInterval = interval;
    clearInterval(window.updateTimer);
    window.updateTimer = setInterval(updateData, updateInterval);
}

window.onload = function() {
    updateData();
    window.updateTimer = setInterval(updateData, updateInterval);
};
