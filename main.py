def 电机A(速度: number, 方向: number):
    pins.analog_write_pin(AnalogPin.P12, 速度)
    pins.digital_write_pin(DigitalPin.P8, 方向)
def 电机B(速度2: number, 方向2: number):
    pins.analog_write_pin(AnalogPin.P16, 速度2)
    pins.digital_write_pin(DigitalPin.P2, 方向2)

def on_forever():
    电机A(pins.analog_read_pin(AnalogPin.P0), 1)
    电机B(pins.analog_read_pin(AnalogPin.P0), 0)
basic.forever(on_forever)
