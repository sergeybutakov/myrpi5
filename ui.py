from flask import Flask, render_template, jsonify, send_from_directory, make_response
import threading
import time
import docker
import os

from sensor import get_all_sensors, get_top_processes
from fan import calculate_rpm, fan_control_loop

app = Flask(__name__)

UPDATE_INTERVAL = float(os.environ.get('UPDATE_INTERVAL', 2))

current_data = {
    "NVME": 0,
    "CPU": 0,
    "RP1": 0,
    "Noctua A4x10": 0,
    "System Fan": 0,
    "mem_total": 0,
    "mem_available": 0,
    "mem_used": 0,
    "mem_percent": 0,
    "disk_total": 0,
    "disk_used": 0,
    "disk_free": 0,
    "disk_percent": 0,
    "CPU_Usage": 0,
    "Uptime": "N/A",
    "top_tasks": [],
    "top_containers": [],
    "total_containers": 0
}

container_stats_data = {}
container_threads = {}
data_lock = threading.Lock()

def listen_container_stats(container):
    global container_stats_data
    try:
        stats_stream = container.stats(decode=True, stream=True)
        prev_stats = None
        for stats in stats_stream:
            if prev_stats:
                cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - prev_stats['cpu_stats']['cpu_usage']['total_usage']
                system_delta = stats['cpu_stats']['system_cpu_usage'] - prev_stats['cpu_stats']['system_cpu_usage']
                num_cpus = len(stats['cpu_stats']['cpu_usage'].get('percpu_usage', [])) or 1
                cpu_percent = 0.0
                if system_delta > 0 and cpu_delta > 0:
                    cpu_percent = (cpu_delta / system_delta) * num_cpus * 100
            else:
                cpu_percent = 0.0

            mem_usage = stats['memory_stats']['usage'] - stats['memory_stats'].get('stats', {}).get('inactive_file', 0)
            mem_usage_mb = mem_usage / (1024 * 1024)

            with data_lock:
                container_stats_data[container.name] = {
                    'id': container.short_id,
                    'name': container.name,
                    'cpu': round(cpu_percent, 2),
                    'mem': round(mem_usage_mb, 1)
                }

            prev_stats = stats
    except Exception as e:
        print(f"Ошибка в listen_container_stats для {container.name}: {e}")
        with data_lock:
            container_stats_data.pop(container.name, None)

def start_container_stats_threads():
    try:
        client = docker.DockerClient(base_url='unix://var/run/docker.sock')
        containers = client.containers.list()
        for container in containers:
            if container.name not in container_threads or not container_threads[container.name].is_alive():
                t = threading.Thread(target=listen_container_stats, args=(container,))
                t.daemon = True
                t.start()
                container_threads[container.name] = t
    except Exception as e:
        print(f"Ошибка при запуске потоков контейнеров: {e}")

def get_top_containers_from_cache(limit=7):
    with data_lock:
        stats_list = list(container_stats_data.values())
    stats_list.sort(key=lambda x: x['cpu'], reverse=True)
    return stats_list[:limit], len(stats_list)

def unified_data_update():
    """Единая функция для синхронного обновления всех данных"""
    while True:
        try:
            # Обновляем сенсоры и процессы
            sensors = get_all_sensors()
            top_tasks = get_top_processes(7)

            # Обновляем данные контейнеров
            top_containers, total_containers = get_top_containers_from_cache(7)

            # Атомарно обновляем все данные
            with data_lock:
                current_data.update(sensors)
                current_data["top_tasks"] = top_tasks
                current_data["top_containers"] = top_containers
                current_data["total_containers"] = total_containers

        except Exception as e:
            print(f"Ошибка при обновлении данных: {e}")

        time.sleep(UPDATE_INTERVAL)

def rescan_containers_periodically():
    """Периодическое сканирование новых контейнеров"""
    while True:
        start_container_stats_threads()
        time.sleep(30)  # Увеличен интервал для уменьшения нагрузки

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data')
def api_data():
    with data_lock:
        return jsonify(current_data.copy())

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/sw.js')
def service_worker():
    response = make_response(send_from_directory('static', 'sw.js'))
    response.headers['Content-Type'] = 'application/javascript'
    response.headers['Service-Worker-Allowed'] = '/'
    return response

# Запуск потоков
t_fan = threading.Thread(target=fan_control_loop)
t_fan.daemon = True
t_fan.start()

# Единый поток для обновления всех данных
t_unified_update = threading.Thread(target=unified_data_update)
t_unified_update.daemon = True
t_unified_update.start()

# Поток для периодического сканирования контейнеров
t_rescan = threading.Thread(target=rescan_containers_periodically)
t_rescan.daemon = True
t_rescan.start()

# Инициализация потоков статистики контейнеров
start_container_stats_threads()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
