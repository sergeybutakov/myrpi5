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
let updateInterval = 1000; // По умолчанию 1 секунда

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

function getThermometerIcon(temp, source) {
    if (source === 'NVME') {
        if (temp <= 35) return 'bi-thermometer-low';
        if (temp <= 50) return 'bi-thermometer-half';
        return 'bi-thermometer-high';
    }
    if (source === 'CPU') {
        if (temp <= 52) return 'bi-thermometer-low';
        if (temp <= 70) return 'bi-thermometer-half';
        return 'bi-thermometer-high';
    }
    if (source === 'RP1') {
        if (temp <= 52) return 'bi-thermometer-low';
        if (temp <= 60) return 'bi-thermometer-half';
        return 'bi-thermometer-high';
    }
    return 'bi-thermometer-half';
}

function setThermoIcon(id, temp, source) {
    const icon = document.getElementById(id);
    if (!icon) return;
    icon.classList.remove('bi-thermometer-low', 'bi-thermometer-half', 'bi-thermometer-high');
    icon.classList.add('bi', getThermometerIcon(temp, source));
}

function updateData() {
    fetch('/api/data')
        .then(response => response.json())
        .then(data => {
            // Обновление температур
            const nvmeTemp = data['NVME'];
            const cpuTemp = data['CPU'];
            const rp1Temp = data['RP1'];

            document.getElementById('nvme').textContent = (nvmeTemp !== undefined ? Math.round(nvmeTemp) + '°C' : '-');
            document.getElementById('cpu').textContent = (cpuTemp !== undefined ? Math.round(cpuTemp) + '°C' : '-');
            document.getElementById('rp1').textContent = (rp1Temp !== undefined ? Math.round(rp1Temp) + '°C' : '-');

            if (nvmeTemp !== undefined) setThermoIcon('nvme-icon', nvmeTemp, 'NVME');
            if (cpuTemp !== undefined) setThermoIcon('cpu-icon', cpuTemp, 'CPU');
            if (rp1Temp !== undefined) setThermoIcon('rp1-icon', rp1Temp, 'RP1');

            // Обновление вентиляторов
            const noctuaRpm = (data['Noctua A4x10'] !== undefined ? data['Noctua A4x10'] : null);
            const systemFanRpm = (data['System Fan'] !== undefined ? data['System Fan'] : null);

            document.getElementById('noctua').textContent =
                (noctuaRpm !== undefined && noctuaRpm !== null ? noctuaRpm + ' RPM' : '-');
            document.getElementById('system_fan').textContent =
                (systemFanRpm !== undefined && systemFanRpm !== null ? systemFanRpm + ' RPM' : '-');

            animateFan('fan-rpi5-icon', systemFanRpm);
            animateFan('fan-noctua-icon', noctuaRpm);

            // Обновление статуса питания
            if ('power_status' in data) {
                const el = document.getElementById('power-status');
                if (el) {
                    if (data['power_status'] === 'power ok') {
                        el.textContent = 'power ok';
                        el.style.color = 'green';
                    } else if (data['power_status'] === 'low power') {
                        el.textContent = 'low power';
                        el.style.color = 'red';
                    } else {
                        el.textContent = 'N/A';
                        el.style.color = '';
                    }
                }
            }

            // Обновление памяти
            if ('mem_used' in data && 'mem_total' in data && 'mem_percent' in data) {
                const memUsedMB = Math.round(data['mem_used'] / (1024 * 1024)) + 'M';
                const memTotalMB = Math.round(data['mem_total'] / (1024 * 1024)) + 'M';
                document.getElementById('mem_percent').textContent = data['mem_percent'] + '%';
                document.getElementById('mem_detail').textContent = memUsedMB + ' / ' + memTotalMB;
            } else {
                document.getElementById('mem_percent').textContent = '-';
                document.getElementById('mem_detail').textContent = '-';
            }

            // Обновление диска
            if ('disk_percent' in data) {
                document.getElementById('disk_percent').textContent = data['disk_percent'] + '%';
                let diskUsed = formatBytes(data['disk_used'], 0);
                let diskTotal = formatBytes(data['disk_total'], 0);
                diskUsed = diskUsed.replace(/ /g, '');
                diskTotal = diskTotal.replace(/ /g, '');
                document.getElementById('disk_detail').textContent =
                    diskUsed + ' / ' + diskTotal;
            } else {
                document.getElementById('disk_percent').textContent = '-';
                document.getElementById('disk_detail').textContent = '-';
            }

            // Обновление CPU
            document.getElementById('cpu_usage').textContent = (data['CPU_Usage'] !== undefined ? data['CPU_Usage'] + '%' : '-');
            document.getElementById('last-update').innerHTML = ' ' + (data['Uptime'] || 'N/A');

            // Обновление счетчиков
            if ('process_count' in data) {
                document.getElementById('process-count').textContent = `(${data['process_count']})`;
            }
            if ('total_containers' in data) {
                document.getElementById('container-count').textContent = `(${data['total_containers']})`;
            }

            // Обновление таблицы процессов
            if ('top_tasks' in data) {
                const tbody = document.querySelector('#tasks-table tbody');
                if (tbody) {
                    tbody.innerHTML = '';
                    data.top_tasks.forEach(proc => {
                        const tr = document.createElement('tr');
                        tr.innerHTML =
                            `<td>${proc.pid}</td>
                             <td>${proc.cmd}</td>
                             <td>${proc.cpu}</td>
                             <td>${proc.mem}M</td>`;
                        tbody.appendChild(tr);
                    });
                }
            }

            // Обновление таблицы контейнеров
            if ('top_containers' in data) {
                const tbody = document.querySelector('#docker-table tbody');
                if (tbody) {
                    tbody.innerHTML = '';
                    data.top_containers.forEach(cont => {
                        const id = cont.id ? cont.id : '-';
                        const cpu = (cont.cpu !== undefined) ? cont.cpu.toFixed(1) + '' : '-';
                        const ram = (cont.mem !== undefined) ? cont.mem.toFixed(0) + 'M' : '-';
                        const tr = document.createElement('tr');
                        tr.innerHTML =
                            `<td>${id}</td>
                             <td>${cont.name}</td>
                             <td>${cpu}</td>
                             <td>${ram}</td>`;
                        tbody.appendChild(tr);
                    });
                }
            }
        })
        .catch(error => {
            console.error('Ошибка обновления данных:', error);
        });
}

// Динамическое управление интервалом обновления
function setUpdateInterval(interval) {
    updateInterval = interval;
    clearInterval(window.updateTimer);
    window.updateTimer = setInterval(updateData, updateInterval);
}

// Инициализация
window.onload = function() {
    updateData();
    window.updateTimer = setInterval(updateData, updateInterval);
};
