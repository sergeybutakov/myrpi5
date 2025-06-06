FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-lgpio libraspberrypi-bin && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages flask psutil gpiozero docker gunicorn

WORKDIR /app
COPY . /app

EXPOSE 5000

CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0:5000", "ui:app"]
