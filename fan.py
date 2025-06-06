import gpiozero.pins.lgpio
import lgpio

def __patched_init(self, chip=None):
    gpiozero.pins.lgpio.LGPIOFactory.__bases__[0].__init__(self)
    chip = 0  # gpiochip0 для Pi 5
    self._handle = lgpio.gpiochip_open(chip)
    self._chip = chip
    self.pin_class = gpiozero.pins.lgpio.LGPIOPin

gpiozero.pins.lgpio.LGPIOFactory.__init__ = __patched_init

from gpiozero import PWMOutputDevice, DigitalInputDevice
from time import sleep, time
import os

PWM_PIN = 14
TACH_PIN = 23
TEMP_MIN = 45
TEMP_MAX = 75
HOLD_100_PERCENT = 10
SHUTDOWN_DELAY = 30
IMPULSES_PER_REVOLUTION = 2
TEMP_POLL_INTERVAL = 1

rpm_count = 0
last_rpm_time = time()
fan = PWMOutputDevice(PWM_PIN, frequency=25)
tach = DigitalInputDevice(TACH_PIN, pull_up=True)
hold_100_until = 0
shutdown_timer = None

def get_temp_from_file(path):
    try:
        with open(path) as f:
            return int(int(f.read()) / 1000)
    except Exception:
        return 0

def get_cpu_temp():
    return get_temp_from_file("/sys/class/thermal/thermal_zone0/temp")

def map_range(value, in_min, in_max, out_min, out_max):
    return max(min(out_max, (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min), out_min)

def count_pulse():
    global rpm_count
    rpm_count += 1

def calculate_rpm():
    global rpm_count, last_rpm_time
    elapsed_time = time() - last_rpm_time
    last_rpm_time = time()
    rpm = (rpm_count / IMPULSES_PER_REVOLUTION) * (60 / elapsed_time) if elapsed_time > 0 else 0
    rpm_count = 0
    return int(rpm)

tach.when_activated = count_pulse

def smooth_start(target_speed, step=0.02, delay=0.1, max_change=0.1):
    current_speed = fan.value
    if abs(current_speed - target_speed) < step:
        fan.value = target_speed
        return
    while abs(current_speed - target_speed) > step:
        change = step if current_speed < target_speed else -step
        if abs(current_speed + change - target_speed) > max_change:
            change = max_change if current_speed < target_speed else -max_change
        current_speed += change
        fan.value = max(0, min(1, current_speed))
        sleep(delay)
    fan.value = target_speed

def fan_control_loop():
    global hold_100_until, shutdown_timer
    while True:
        temp = get_cpu_temp()
        fan_speed = 0

        if temp >= TEMP_MAX:
            fan_speed = 1
            hold_100_until = time() + HOLD_100_PERCENT
        elif temp >= TEMP_MIN:
            fan_speed = map_range(temp, TEMP_MIN, TEMP_MAX, 0, 1)
        else:
            fan_speed = 0

        if temp < TEMP_MIN:
            if shutdown_timer is None:
                shutdown_timer = time()
            elif time() - shutdown_timer >= SHUTDOWN_DELAY:
                fan.value = 0
                sleep(TEMP_POLL_INTERVAL)
                continue
        else:
            shutdown_timer = None

        if hold_100_until and time() < hold_100_until:
            fan_speed = 1

        smooth_start(fan_speed, max_change=0.1)
        sleep(TEMP_POLL_INTERVAL)
