function 电机A (速度: number, 方向: number) {
    pins.analogWritePin(AnalogPin.P12, 速度)
    pins.digitalWritePin(DigitalPin.P8, 方向)
}
function 电机B (速度2: number, 方向2: number) {
    pins.analogWritePin(AnalogPin.P16, 速度2)
    pins.digitalWritePin(DigitalPin.P2, 方向2)
}
basic.forever(function () {
    电机A(pins.analogReadPin(AnalogPin.P0), 1)
    电机B(pins.analogReadPin(AnalogPin.P0), 0)
})
