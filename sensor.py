import psutil
import shutil
import os
import glob
import subprocess

def get_cpu_usage():
    try:
        return psutil.cpu_percent(interval=1)
    except Exception:
        return 0

def get_cpu_temp():
    try:
        with open('/sys/class/thermal/thermal_zone0/temp') as f:
            temp = int(f.read()) / 1000
            if temp > 0:
                return round(temp, 1)
    except Exception:
        pass
    for path in glob.glob('/sys/class/hwmon/hwmon*/temp*_input'):
        try:
            with open(path) as f:
                temp = int(f.read()) / 1000
                if temp > 0:
                    return round(temp, 1)
        except Exception:
            continue
    return 0

def calculate_rpm():
    from fan import calculate_rpm
    return calculate_rpm()

def get_system_fan_rpm():
    try:
        for hwmon in os.listdir('/sys/class/hwmon'):
            with open(f'/sys/class/hwmon/{hwmon}/name') as f:
                name = f.read().strip().lower()
            if 'fan' in name or 'pwm' in name:
                for fname in os.listdir(f'/sys/class/hwmon/{hwmon}'):
                    if fname.startswith('fan') and fname.endswith('_input'):
                        with open(f'/sys/class/hwmon/{hwmon}/{fname}') as ff:
                            return int(ff.read().strip())
    except Exception:
        return 0
    return 0

def get_nvme_temp():
    try:
        for hwmon in os.listdir('/sys/class/hwmon'):
            label_path = f'/sys/class/hwmon/{hwmon}/name'
            if os.path.exists(label_path):
                with open(label_path) as f:
                    name = f.read().strip().lower()
                if 'nvme' in name:
                    for fname in os.listdir(f'/sys/class/hwmon/{hwmon}'):
                        if fname.startswith('temp') and fname.endswith('_input'):
                            with open(f'/sys/class/hwmon/{hwmon}/{fname}') as tf:
                                temp = int(tf.read().strip()) / 1000.0
                                return round(temp, 1)
    except Exception:
        pass
    return 0

def get_rp1_temp():
    try:
        for hwmon in os.listdir('/sys/class/hwmon'):
            label_path = f'/sys/class/hwmon/{hwmon}/name'
            if os.path.exists(label_path):
                with open(label_path) as f:
                    name = f.read().strip().lower()
                if 'rp1' in name:
                    for fname in os.listdir(f'/sys/class/hwmon/{hwmon}'):
                        if fname.startswith('temp') and fname.endswith('_input'):
                            with open(f'/sys/class/hwmon/{hwmon}/{fname}') as tf:
                                temp = int(tf.read().strip()) / 1000.0
                                return round(temp, 1)
    except Exception:
        pass
    return 0

def get_memory_usage():
    mem = psutil.virtual_memory()
    return {
        "mem_total": mem.total,
        "mem_available": mem.available,
        "mem_used": mem.used,
        "mem_percent": mem.percent
    }

def get_disk_usage(mount_point='/'):
    try:
        usage = shutil.disk_usage(mount_point)
        return {
            "disk_total": usage.total,
            "disk_used": usage.used,
            "disk_free": usage.free,
            "disk_percent": round((usage.used / usage.total) * 100, 1)
        }
    except Exception:
        return {
            "disk_total": 0,
            "disk_used": 0,
            "disk_free": 0,
            "disk_percent": 0
        }

def get_uptime():
    try:
        with open('/proc/uptime', 'r') as f:
            uptime_seconds = float(f.readline().split()[0])
        days = int(uptime_seconds // (24 * 3600))
        uptime_seconds %= (24 * 3600)
        hours = int(uptime_seconds // 3600)
        uptime_seconds %= 3600
        minutes = int(uptime_seconds // 60)
        if days > 0:
            return f"{days}d {hours}h {minutes}m"
        elif hours > 0:
            return f"{hours}h {minutes}m"
        else:
            return f"{minutes}m"
    except Exception:
        return "N/A"

def get_top_processes(n=7):
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info', 'cmdline']):
        try:
            if p.info['cmdline']:
                exec_path = p.info['cmdline'][0]
                exec_name = '/' + os.path.basename(exec_path)
            else:
                exec_name = '/' + (p.info['name'] or '')
            mem_mb = int(round(p.info['memory_info'].rss / (1024 * 1024)))
            procs.append({
                'pid': p.info['pid'],
                'cmd': exec_name,
                'cpu': round(p.info['cpu_percent'], 1),
                'mem': mem_mb,
            })
        except Exception:
            continue
    procs = sorted(procs, key=lambda x: (x['cpu'], x['mem']), reverse=True)
    return procs[:n]

def get_process_count():
    try:
        return len(list(psutil.process_iter()))
    except Exception:
        return 0

def get_container_count():
    try:
        import docker
        client = docker.DockerClient(base_url='unix://var/run/docker.sock')
        return len(client.containers.list())
    except Exception:
        return 0

def get_monitored_disks():
    # Получаем список дисков из переменной окружения
    disk_list = os.environ.get('MONITOR_DISKS', '')
    disks = [d.strip() for d in disk_list.split(',') if d.strip()]
    return disks

def get_disk_hwmon_temp(disk):
    # Возвращает температуру для hwmon-диска (например, nvme0)
    try:
        for hwmon in os.listdir('/sys/class/hwmon'):
            label_path = f'/sys/class/hwmon/{hwmon}/name'
            if os.path.exists(label_path):
                with open(label_path) as f:
                    name = f.read().strip().lower()
                if disk in name:
                    for fname in os.listdir(f'/sys/class/hwmon/{hwmon}'):
                        if fname.startswith('temp') and fname.endswith('_input'):
                            with open(f'/sys/class/hwmon/{hwmon}/{fname}') as tf:
                                temp = int(tf.read().strip()) / 1000.0
                                return round(temp, 1)
    except Exception:
        pass
    return None

def get_disk_info(disk):
    info = {}
    temp = get_disk_hwmon_temp(disk)
    if temp is not None:
        info['temp'] = temp
    try:
        # Пробуем /mnt/<disk>
        mount_point = f'/mnt/{disk}'
        if os.path.ismount(mount_point):
            usage = shutil.disk_usage(mount_point)
            info['total'] = usage.total
            info['used'] = usage.used
            info['free'] = usage.free
            info['percent'] = round((usage.used / usage.total) * 100, 1) if usage.total > 0 else 0
        else:
            if disk == 'root' or disk == '/':
                usage = shutil.disk_usage('/')
                info['total'] = usage.total
                info['used'] = usage.used
                info['free'] = usage.free
                info['percent'] = round((usage.used / usage.total) * 100, 1) if usage.total > 0 else 0
    except Exception:
        pass
    return info

def get_all_disks_info():
    disks = get_monitored_disks()
    result = {}
    for disk in disks:
        info = get_disk_info(disk)
        if info:
            result[disk] = info
    return result

def get_all_sensors():
    sensors = {
        "NVME": get_nvme_temp(),
        "CPU": get_cpu_temp(),
        "RP1": get_rp1_temp(),
        "Noctua A4x10": calculate_rpm(),
        "System Fan": get_system_fan_rpm(),
        **get_memory_usage(),
        **get_disk_usage('/'),
        "CPU_Usage": get_cpu_usage(),
        "Uptime": get_uptime(),
        "process_count": get_process_count(),
        "container_count": get_container_count(),
        "power_status": get_power_status()
    }
    disks_info = get_all_disks_info()
    if disks_info:
        sensors['disks'] = disks_info
    return sensors

def get_power_status():
    """
    Проверяет статус питания Raspberry Pi через vcgencmd get_throttled.
    Возвращает:
        'power ok' — если проблем с питанием нет,
        'low power' — если есть или были проблемы с питанием,
        'unknown' — если не удалось получить статус.
    """
    try:
        result = subprocess.run(['vcgencmd', 'get_throttled'], capture_output=True, text=True)
        if result.returncode != 0:
            return 'unknown'
        val = result.stdout.strip().split('=')[-1]
        val_int = int(val, 16)
        if (val_int & 0x1) or (val_int & 0x10000):
            return 'low power'
        return 'power ok'
    except Exception:
        return 'unknown'
