// QXC_IR blocks supporting a Keyestudio Infrared Wireless Module Kit
// (receiver module+remote controller)

const enum qxc_IrButton {
    //% block="R"
    R = 0xa2,
    //% block="G"
    G = 0x62,
    //% block="B"
    B = 0xe2,
    //% block="ON/OFF"
    OnOff = 0x22,
    //% block="▲"
    Up = 0x02,
    //% block="back"
    Back = 0xc2,
    //% block="◀"
    Left = 0xe0,
    //% block="OK"
    Ok = 0xa8,
    //% block="▶"
    Right = 0x90,
    //% block="0"
    Number_0 = 0x68,
    //% block="▼"
    Down = 0x98,
    //% block="TEST"
    Test = 0xb0,
    //% block="1"
    Number_1 = 0x30,
    //% block="2"
    Number_2 = 0x18,
    //% block="3"
    Number_3 = 0x7a,
    //% block="4"
    Number_4 = 0x10,
    //% block="5"
    Number_5 = 0x38,
    //% block="6"
    Number_6 = 0x5a,
    //% block="7"
    Number_7 = 0x42,
    //% block="8"
    Number_8 = 0x4a,
    //% block="9"
    Number_9 = 0x52,
    //% block="any"
    Any = -1
}

const enum IrButtonAction {
    //% block="按下"
    Pressed = 0,
    //% block="释放"
    Released = 1,
}

const enum qxc_IrProtocol {
    //% block="NEC"
    NEC = 0,
    //% block="Keyestudio"
    Keyestudio = 1,

}

//% color=#888800 icon="\uf0a4" block="QXC_红外接收"
//% category="QXC_红外接收"
namespace QXC_irRcv {
    let irState: IrState;

    const MICROBIT_QXC_IR_IR_NEC = 777;
    const MICROBIT_QXC_IR_IR_DATAGRAM = 778;
    const MICROBIT_QXC_IR_IR_BUTTON_PRESSED_ID = 789;
    const MICROBIT_QXC_IR_IR_BUTTON_RELEASED_ID = 790;
    const IR_REPEAT = 256;
    const IR_INCOMPLETE = 257;
    const IR_DATAGRAM = 258;

    interface IrState {
        protocol: qxc_IrProtocol;
        hasNewDatagram: boolean;
        bitsReceived: uint8;
        addressSectionBits: uint16;
        commandSectionBits: uint16;
        hiword: uint16;
        loword: uint16;
    }

    function appendBitToDatagram(bit: number): number {
        irState.bitsReceived += 1;

        if (irState.bitsReceived <= 8) {
            irState.hiword = (irState.hiword << 1) + bit;
            if (irState.protocol === qxc_IrProtocol.Keyestudio && bit === 1) {
                // recover from missing message bits at the beginning
                // Keyestudio address is 0 and thus missing bits can be detected
                // by checking for the first inverse address bit (which is a 1)
                irState.bitsReceived = 9;
                irState.hiword = 1;
            }
        } else if (irState.bitsReceived <= 16) {
            irState.hiword = (irState.hiword << 1) + bit;
        } else if (irState.bitsReceived <= 32) {
            irState.loword = (irState.loword << 1) + bit;
        }

        if (irState.bitsReceived === 32) {
            irState.addressSectionBits = irState.hiword & 0xffff;
            irState.commandSectionBits = irState.loword & 0xffff;
            return IR_DATAGRAM;
        } else {
            return IR_INCOMPLETE;
        }
    }

    function decode(markAndSpace: number): number {
        if (markAndSpace < 1600) {
            // low bit
            return appendBitToDatagram(0);
        } else if (markAndSpace < 2700) {
            // high bit
            return appendBitToDatagram(1);
        }

        irState.bitsReceived = 0;

        if (markAndSpace < 12500) {
            // Repeat detected
            return IR_REPEAT;
        } else if (markAndSpace < 14500) {
            // Start detected
            return IR_INCOMPLETE;
        } else {
            return IR_INCOMPLETE;
        }
    }

    function enableIrMarkSpaceDetection(pin: DigitalPin) {
        pins.setPull(pin, PinPullMode.PullNone);

        let mark = 0;
        let space = 0;

        pins.onPulsed(pin, PulseValue.Low, () => {
            // HIGH, see https://github.com/microsoft/pxt-microbit/issues/1416
            mark = pins.pulseDuration();
        });

        pins.onPulsed(pin, PulseValue.High, () => {
            // LOW
            space = pins.pulseDuration();
            const status = decode(mark + space);

            if (status !== IR_INCOMPLETE) {
                control.raiseEvent(MICROBIT_QXC_IR_IR_NEC, status);
            }
        });
    }

	/**
	 * Connects to the IR receiver module at the specified pin and configures the IR protocol.
	 * @param pin IR receiver pin, eg: DigitalPin.P0
	 * @param protocol IR protocol, eg: qxc_IrProtocol.Keyestudio
	 */

    //% blockId="QXC_IR_infrared_connect_receiver"
    //% block="红外连接引脚 %pin and 解码类型 %protocol"
    //% pin.fieldEditor="gridpicker"
    //% pin.fieldOptions.columns=4
    //% pin.fieldOptions.tooltips="false"
    //% weight=90
    //% pin.defl=P14
    //% protocol.defl=1
    export function connectIrReceiver(
        pin: DigitalPin,
        protocol: qxc_IrProtocol
    ): void {
        if (irState) {
            return;
        }

        irState = {
            protocol: protocol,
            bitsReceived: 0,
            hasNewDatagram: false,
            addressSectionBits: 0,
            commandSectionBits: 0,
            hiword: 0, // TODO replace with uint32
            loword: 0,
        };

        enableIrMarkSpaceDetection(pin);

        let activeCommand = -1;
        let repeatTimeout = 0;
        const REPEAT_TIMEOUT_MS = 120;

        control.onEvent(
            MICROBIT_QXC_IR_IR_NEC,
            EventBusValue.MICROBIT_EVT_ANY,
            () => {
                const irEvent = control.eventValue();

                // Refresh repeat timer
                if (irEvent === IR_DATAGRAM || irEvent === IR_REPEAT) {
                    repeatTimeout = input.runningTime() + REPEAT_TIMEOUT_MS;
                }

                if (irEvent === IR_DATAGRAM) {
                    irState.hasNewDatagram = true;
                    control.raiseEvent(MICROBIT_QXC_IR_IR_DATAGRAM, 0);

                    const newCommand = irState.commandSectionBits >> 8;

                    // Process a new command
                    if (newCommand !== activeCommand) {
                        if (activeCommand >= 0) {
                            control.raiseEvent(
                                MICROBIT_QXC_IR_IR_BUTTON_RELEASED_ID,
                                activeCommand
                            );
                        }

                        activeCommand = newCommand;
                        control.raiseEvent(
                            MICROBIT_QXC_IR_IR_BUTTON_PRESSED_ID,
                            newCommand
                        );
                    }
                }
            }
        );

        control.inBackground(() => {
            while (true) {
                if (activeCommand === -1) {
                    // sleep to save CPU cylces
                    basic.pause(2 * REPEAT_TIMEOUT_MS);
                } else {
                    const now = input.runningTime();
                    if (now > repeatTimeout) {
                        // repeat timed out
                        control.raiseEvent(
                            MICROBIT_QXC_IR_IR_BUTTON_RELEASED_ID,
                            activeCommand
                        );
                        activeCommand = -1;
                    } else {
                        basic.pause(REPEAT_TIMEOUT_MS);
                    }
                }
            }
        });
    }

	/**
	 * Do something when a specific button is pressed or released on the remote control.
	 * @param button the button to be checked
	 * @param action the trigger action
	 * @param handler body code to run when the event is raised
	 */
    //% blockId=QXC_IR_infrared_on_ir_button
    //% block="当按键 | %button | %action"
    //% button.fieldEditor="gridpicker"
    //% button.fieldOptions.columns=3
    //% button.fieldOptions.tooltips="false"
    //% weight=69
    export function onIrButton(
        button: qxc_IrButton,
        action: IrButtonAction,
        handler: () => void
    ) {
        control.onEvent(
            action === IrButtonAction.Pressed
                ? MICROBIT_QXC_IR_IR_BUTTON_PRESSED_ID
                : MICROBIT_QXC_IR_IR_BUTTON_RELEASED_ID,
            button === qxc_IrButton.Any ? EventBusValue.MICROBIT_EVT_ANY : button,
            () => {
                handler();
            }
        );
    }

	/**
	 * Returns the code of the IR button that was pressed last. Returns -1 (qxc_IrButton.Any) if no button has been pressed yet.
	 */
    //% blockId=QXC_IR_infrared_ir_button_pressed
    //% block="键值"
    //% weight=67
    export function irButton(): number {
        if (!irState) {
            return qxc_IrButton.Any;
        }
        return irState.commandSectionBits >> 8;
    }

	/**
	 * Do something when an IR datagram is received.
	 * @param handler body code to run when the event is raised
	 */
    //% blockId=QXC_IR_infrared_on_ir_datagram
    //% block="当收到红外数据"
    //% weight=68
    export function onIrDatagram(handler: () => void) {
        control.onEvent(
            MICROBIT_QXC_IR_IR_DATAGRAM,
            EventBusValue.MICROBIT_EVT_ANY,
            () => {
                handler();
            }
        );
    }

	/**
	 * Returns the IR datagram as 32-bit hexadecimal string.
	 * The last received datagram is returned or "0x00000000" if no data has been received yet.
	 */
    //% blockId=QXC_IR_infrared_ir_datagram
    //% block="红外数据报文"
    //% weight=67
    export function irDatagram(): string {
        if (!irState) {
            return "0x00000000";
        }
        return (
            "0x" +
            ir_rec_to16BitHex(irState.addressSectionBits) +
            ir_rec_to16BitHex(irState.commandSectionBits)
        );
    }

	/**
	 * Returns true if any IR data was received since the last call of this function. False otherwise.
	 */
    //% blockId=QXC_IR_infrared_was_any_ir_datagram_received
    //% block="有红外数据"
    //% weight=57
    export function wasIrDataReceived(): boolean {
        if (!irState) {
            return false;
        }
        if (irState.hasNewDatagram) {
            irState.hasNewDatagram = false;
            return true;
        } else {
            return false;
        }
    }

	/**
	 * Returns the command code of a specific IR button.
	 * @param button the button
	 */
    //% blockId=QXC_IR_infrared_button_code
    //% button.fieldEditor="gridpicker"
    //% button.fieldOptions.columns=3
    //% button.fieldOptions.tooltips="false"
    //% block="码值 %button"
    //% weight=56
    export function irButtonCode(button: qxc_IrButton): number {
        return button as number;
    }

    function ir_rec_to16BitHex(value: number): string {
        let hex = "";
        for (let pos = 0; pos < 4; pos++) {
            let remainder = value % 16;
            if (remainder < 10) {
                hex = remainder.toString() + hex;
            } else {
                hex = String.fromCharCode(55 + remainder) + hex;
            }
            value = Math.idiv(value, 16);
        }
        return hex;
    }
}
//% color="#888800" icon="\uf0a4" block="QXC_电机驱动"
//% groups="['双驱', '四驱','单驱','初始化',]"
//% category="七星虫电机驱动模块
namespace QXC_driver {
	/** 
		//% block="8 channel Tracking Sensor Init addr = $addr"
		//% addr.defl=8
		export function trackingSensorInit(addr:number) {
	
		}
		*/
    /**
     * This is a reporter block that returns a number
     */





    //% block="电机驱动 速度（-1023~1023） = $speed  方向 = $direction  调速 = $motorspeed "
    //% inlineInputMode=inline
    //% group="单驱"
    //% speed.defl=50

    export function motor1(speed: number, direction: DigitalPin, motorspeed: AnalogPin) {
        if (speed >= 0) {
            pins.digitalWritePin(direction, 1);
            pins.analogWritePin(motorspeed, speed);
        }

        else {
            pins.digitalWritePin(direction, 0);
            pins.analogWritePin(motorspeed, -speed);
        }


    }
    //% block="uart电机初始化"
    //% group="初始化"
    export function motor_init() {
        serial.redirect(SerialPin.P15, SerialPin.P13, BaudRate.BaudRate9600);
    }

    //% block="uart电机驱动 left = $left \\% right = $right \\%"
    //% inlineInputMode=inline
    //% group="双驱"
    //% left.defl=50
    //% left.min=-100 left.max=100
    //% right.defl=50
    //% right.min=-100 right.max=100
    export function motor2(left: number, right: number) {
        let buf = pins.createBuffer(6);
        buf[0] = 127;
        buf[1] = left;
        buf[2] = right;
        buf[3] = left;
        buf[4] = right;
        buf[5] = 126;

        serial.writeBuffer(buf);


    }



    //% group="四驱"

    //% block="uart 4路电机驱动 M1$M1 \\%| M2$M2 \\%| M3$M3 \\%| M4$M4 \\%|"
    //% inlineInputMode=inline
    //% M1.defl=50
    //% M1.min=-100 left.max=100
    //% M2.defl=50
    //% M2.min=-100 left.max=100
    //% M3.defl=50
    //% M3.min=-100 left.max=100
    //% M4.defl=50
    //% M4.min=-100 left.max=100
    export function motor4(M1: number, M2: number, M3: number, M4: number) {
        let buf = pins.createBuffer(6);
        buf[0] = 127;
        buf[1] = M1;
        buf[2] = M2;
        buf[3] = M3;
        buf[4] = M4;
        buf[5] = 126;

        serial.writeBuffer(buf);

    }

}
//% color="#888800" icon="\uf0a4" block="QXC_触摸模块"
//% groups="['8键', '16键']"
//% category="触摸模块
namespace QXC_touch {

    //% block="8键触摸 端口 时钟 %bs818clk|数据 %bs818dat|"
    //% inlineInputMode=inline
    //% group="8键"
    export function bs818init(bs818clk: DigitalPin, bs818dat: DigitalPin) {
        // send pulse
        pins.setPull(bs818clk, PinPullMode.PullNone);
        pins.setPull(bs818dat, PinPullMode.PullUp);

        let rcvDate = 0x0000;
        rcvDate = rcvDate >>> 0;
        rcvDate = 0x0000;
        for (let index = 0; index < 16; index++) {
            pins.digitalWritePin(bs818clk, 0);
            control.waitMicros(1);
            pins.digitalWritePin(bs818clk, 1);
            control.waitMicros(1);
            rcvDate |= pins.digitalReadPin(bs818dat) << index;
        }

        rcvDate = rcvDate & 0xFF;
        return rcvDate;





    }
    //% block="16键触摸 端口 时钟 %ttp229clk|数据 %ttp229dat|"
    //% inlineInputMode=inline
    //% group="16键"
    export function ttp229init(ttp229clk: DigitalPin, ttp229dat: DigitalPin) {
        // send pulse
        pins.setPull(ttp229clk, PinPullMode.PullNone);
        pins.setPull(ttp229dat, PinPullMode.PullNone);
        let rcvDate = 0x0000;;
        rcvDate = rcvDate >>> 0;
        rcvDate = 0x0000;
        pins.digitalWritePin(ttp229dat, 1);
        pause(93);
        pins.digitalWritePin(ttp229dat, 1);
        pause(10);
        for (let index = 0; index < 16; index++) {
            pins.digitalWritePin(ttp229clk, 0);
            pins.digitalWritePin(ttp229clk, 1);

            rcvDate |= pins.digitalReadPin(ttp229dat) << index;
        }
        return rcvDate;



    }
}
/* ---------------------------------------------------- */
enum PingUnit {
    //% block="μs"
    MicroSeconds,
    //% block="cm"
    Centimeters,
    //% block="inches"
    Inches
}

/**
 * Sonar and ping utilities
 */
//% color="#888800" weight=10 icon="\uf0a4" block="QXC_超声波测距"
namespace QXC_sonar {
    /**
     * Send a ping and get the echo time (in microseconds) as a result
     * @param trig tigger pin
     * @param echo echo pin
     * @param unit desired conversion unit
     * @param maxCmDistance maximum distance in centimeters (default is 500)
     */
    //% blockId=sonar_ping 
    //% block="引脚trig %trig|echo %echo|单位 %unit"
    //% inlineInputMode=inline
    export function ping(trig: DigitalPin, echo: DigitalPin, unit: PingUnit, maxCmDistance = 500): number {
        // send pulse
        pins.setPull(trig, PinPullMode.PullNone);
        pins.digitalWritePin(trig, 0);
        control.waitMicros(2);
        pins.digitalWritePin(trig, 1);
        control.waitMicros(10);
        pins.digitalWritePin(trig, 0);

        // read pulse
        const d = pins.pulseIn(echo, PulseValue.High, maxCmDistance * 58);

        switch (unit) {
            case PingUnit.Centimeters: return Math.idiv(d, 58);
            case PingUnit.Inches: return Math.idiv(d, 148);
            default: return d;
        }
    }
}
/**
 * makecode Four Digit Display (TM1650) Package.
 * From microbit/micropython Chinese community.
 * http://www.micropython.org.cn
 */

/**
 * TM1650 digit Display
 */
//% weight=100 color=#64C800 icon="4" block="TM1650 4位数码管"
namespace TM1650_4bit {

    let COMMAND_I2C_ADDRESS = 0x24
    let DISPLAY_I2C_ADDRESS = 0x34
    let _SEG = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5E, 0x79, 0x71];

    let _intensity = 3
    let dbuf = [0, 0, 0, 0]

    /**
     * send command to display
     * @param is command, eg: 0
     */
    function cmd(c: number) {
        pins.i2cWriteNumber(COMMAND_I2C_ADDRESS, c, NumberFormat.Int8BE)
    }

    /**
     * send data to display
     * @param is data, eg: 0
     */
    function dat(bit: number, d: number) {
        pins.i2cWriteNumber(DISPLAY_I2C_ADDRESS + (bit % 4), d, NumberFormat.Int8BE)
    }

    /**
     * turn on display
     */
    //% blockId="TM1650_4bit_ON" block="数码管显示"
    //% weight=50 blockGap=8
    export function on() {
        cmd(_intensity * 16 + 1)
    }

    /**
     * turn off display
     */
    //% blockId="TM1650_4bit_OFF" block="数码管关闭"
    //% weight=50 blockGap=8
    export function off() {
        _intensity = 0
        cmd(0)
    }

    /**
     * clear display content
     */
    //% blockId="TM1650_4bit_CLEAR" block="清除显示"
    //% weight=40 blockGap=8
    export function clear() {
        dat(0, 0)
        dat(1, 0)
        dat(2, 0)
        dat(3, 0)
        dbuf = [0, 0, 0, 0]
    }

    /**
     * show a digital in given position
     * @param digit is number (0-15) will be shown, eg: 1
     * @param bit is position, eg: 0
     */
    //% blockId="TM1650_4bit_DIGIT" block="显示数字 %num|在第 %bit个"
    //% weight=80 blockGap=8
    //% num.max=15 num.min=0
    export function digit(num: number, bit: number) {
        dbuf[bit % 4] = _SEG[num % 16]
        dat(bit, _SEG[num % 16])
    }

    /**
     * show a number in display
     * @param num is number will be shown, eg: 100
     */
    //% blockId="TM1650_4bit_SHOW_NUMBER" block="显示数字 %num"
    //% weight=100 blockGap=8
    export function showNumber(num: number) {
        if (num < 0) {
            dat(0, 0x40) // '-'
            num = -num
        }
        else
            digit((num / 1000) % 10, 0)
        digit(num % 10, 3)
        digit((num / 10) % 10, 2)
        digit((num / 100) % 10, 1)
    }

    /**
     * show a number in hex format
     * @param num is number will be shown, eg: 123
     */
    //% blockId="TM1650_4bit_SHOW_HEX_NUMBER" block="显示16进制数 %num"
    //% weight=90 blockGap=8
    export function showHex(num: number) {
        if (num < 0) {
            dat(0, 0x40) // '-'
            num = -num
        }
        else
            digit((num >> 12) % 16, 0)
        digit(num % 16, 3)
        digit((num >> 4) % 16, 2)
        digit((num >> 8) % 16, 1)
    }

    /**
     * show Dot Point in given position
     * @param bit is positiion, eg: 0
     * @param show is true/false, eg: true
     */
    //% blockId="TM1650_4bit_SHOW_DP" block="第%bit位小数点|显示 %num"
    //% weight=80 blockGap=8
    export function showDpAt(bit: number, show: boolean) {
        if (show) dat(bit, dbuf[bit % 4] | 0x80)
        else dat(bit, dbuf[bit % 4] & 0x7F)
    }

    /**
     * set display intensity
     * @param dat is intensity of the display, eg: 3
     */
    //% blockId="TM1650_4bit_INTENSITY" block="设置亮度 %dat"
    //% weight=70 blockGap=8
    export function setIntensity(dat: number) {
        if ((dat < 0) || (dat > 8))
            return;
        if (dat == 0)
            off()
        else {
            _intensity = dat
            cmd((dat << 4) | 0x01)
        }
    }

    on();
}
/**
 * Use weights to control the order of blocks, a higher
 * weight means higher in the toolbox
 */
const enum shiftOutMode {
    //% block="高位先出"
    LSBFIRST = 0,
    //% block="低位先出"
    HSBFIRST = 1,
}
//% color="#AA278D" block="移位输出shiftout"
namespace shiftOut {
    /**
     * 串行移位输出
     */
    //% block="移位输出 数据$dataPin|时钟$clockPin|模式$bitOrder数据$val| "
    //% inlineInputMode=inline
    //% weight=50
    export function shiftOut(dataPin: DigitalPin, clockPin: DigitalPin, bitOrder: shiftOutMode, val: number) {

        {
            pins.setPull(dataPin, PinPullMode.PullNone);
            pins.setPull(clockPin, PinPullMode.PullNone);
            val = val >>> 0;
            for (let i = 0; i < 8; i++) {

                //control.waitMicros(5);
                if (bitOrder == 0) {
                    if (!!(val & (1 << i)))
                        pins.digitalWritePin(dataPin, 1);
                    else
                        pins.digitalWritePin(dataPin, 0);
                }

                else {
                    if (!!(val & (1 << (7 - i))))
                        pins.digitalWritePin(dataPin, 1);
                    else
                        pins.digitalWritePin(dataPin, 0);
                }

                pins.digitalWritePin(clockPin, 0);

                pins.digitalWritePin(clockPin, 1);



            }

        }

    }
}
const enum SEGMODE {
    //% block="共阳极"
    AA = 0,
    //% block="共阴极"
    KK = 1,
}

//% color="#AA278D" block="QXC_数码管"
namespace numToSeg {
    let segList = [0xc0, 0xf9, 0xa4, 0xb0, 0x99, 0x92, 0x82, 0xf8, 0x80, 0x90]
    /**
    * 数码管码值
    */
    //% block="数码管 数$num|类型$segMode|"
    //% inlineInputMode=inline
    //% weight=50
    export function numberToSeg(num: number, segMode: SEGMODE) {
        if (segMode == 1)
            return ~segList[num];
        else
            return segList[num];
    }
}

const enum voiceNum {
    //% block="0"
    value0 = 0,
    //% block="1"
    value1 = 1,
    //% block="2"
    value2 = 2,
    //% block="3"
    value3 = 3,
    //% block="4"
    value4 = 4,
    //% block="5"
    value5 = 5,
    //% block="6"
    value6 = 6,
    //% block="7"
    value7 = 7,
    //% block="8"
    value8 = 8,
    //% block="9"
    value9 = 9,
    //% block="十"
    value10 = 10,
    //% block="百"
    value11 = 11,
    //% block="千"
    value12 = 12,
    //% block="万"
    value13 = 13,
    //% block="亿"
    value14 = 14,
    //% block="点"
    value15 = 15,
    //% block="负"
    value16 = 16,
    //% block="温度"
    value17 = 17,
    //% block="湿度"
    value18 = 18,
    //% block="电量"
    value19 = 19,
    //% block="摄氏度"
    value20 = 20,
    //% block="百分之"
    value21 = 21,
    //% block="日期"
    value22 = 22,
    //% block="时间"
    value23 = 23,
    //% block="定时"
    value24 = 24,
    //% block="年"
    value25 = 25,
    //% block="月"
    value26 = 26,
    //% block="日"
    value27 = 27,
    //% block="号"
    value28 = 28,
    //% block="分"
    value29 = 29,
    //% block="秒"
    value30 = 30,
    //% block="加"
    value31 = 31,
    //% block="减"
    value32 = 32,
    //% block="乘"
    value33 = 33,
    //% block="除"
    value34 = 34,
    //% block="等于"
    value35 = 35,
    //% block="红"
    value36 = 36,
    //% block="黄"
    value37 = 37,
    //% block="绿"
    value38 = 38,
    //% block="蓝"
    value39 = 39,
    //% block="闪烁"
    value40 = 40,
    //% block="次"
    value41 = 41,
    //% block="前进"
    value42 = 42,
    //% block="后退"
    value43 = 43,
    //% block="左转"
    value44 = 44,
    //% block="右转"
    value45 = 45,
    //% block="停止"
    value46 = 46,
    //% block="倒车"
    value47 = 47,
    //% block="正确"
    value48 = 48,
    //% block="错误"
    value49 = 49,
    //% block="确认"
    value50 = 50,
    //% block="注意"
    value51 = 51,
    //% block="输入"
    value52 = 52,
    //% block="密码"
    value53 = 53,
    //% block="刷卡"
    value54 = 54,
    //% block="金额"
    value55 = 55,
    //% block="支付宝"
    value56 = 56,
    //% block="微信"
    value57 = 57,
    //% block="到账"
    value58 = 58,
    //% block="元"
    value59 = 59,
    //% block="打开"
    value60 = 60,
    //% block="关闭"
    value61 = 61,
    //% block="灯"
    value62 = 62,
    //% block="色"
    value63 = 63,
    //% block="现在"
    value64 = 64,
    //% block="当前"
    value65 = 65,
    //% block="分钟"
    value66 = 66,
    //% block="上午"
    value67 = 67,
    //% block="中午"
    value68 = 68,
    //% block="下午"
    value69 = 69,
    //% block="晚上"
    value70 = 70,
    //% block="星期"
    value71 = 71,
    //% block="天"
    value72 = 72,
    //% block="整"
    value73 = 73,
    //% block="度"
    value74 = 74,
    //% block="前方"
    value75 = 75,
    //% block="距离"
    value76 = 76,
    //% block="厘米"
    value77 = 77,
    //% block="东"
    value78 = 78,
    //% block="南"
    value79 = 79,
    //% block="西"
    value80 = 80,
    //% block="北"
    value81 = 81,
    //% block="中"
    value82 = 82,
    //% block="上"
    value83 = 83,
    //% block="下"
    value84 = 84,
    //% block="左"
    value85 = 85,
    //% block="右"
    value86 = 86,
    //% block="开关"
    value87 = 87,
    //% block="返回"
    value88 = 88,
    //% block="测试"
    value89 = 89,
    //% block="功能"
    value90 = 90,
    //% block="请"
    value91 = 91,
    //% block="祝"
    value92 = 92,
    //% block="好"
    value93 = 93,
    //% block="您"
    value94 = 94,
    //% block="爸爸"
    value95 = 95,
    //% block="妈妈"
    value96 = 96,
    //% block="爷爷"
    value97 = 97,
    //% block="奶奶"
    value98 = 98,
    //% block="姥姥"
    value99 = 99,
    //% block="姥爷"
    value100 = 100,
    //% block="哥哥"
    value101 = 101,
    //% block="姐姐"
    value102 = 102,
    //% block="弟弟"
    value103 = 103,
    //% block="妹妹"
    value104 = 104,
    //% block="叔叔"
    value105 = 105,
    //% block="阿姨"
    value106 = 106,
    //% block="老师"
    value107 = 107,
    //% block="同学"
    value108 = 108,
    //% block="谢谢"
    value109 = 109,
    //% block="再见"
    value110 = 110,
    //% block="不客气"
    value111 = 111,
    //% block="没关系"
    value112 = 112,
    //% block="对不起"
    value113 = 113,
    //% block="圆形"
    value114 = 114,
    //% block="方形"
    value115 = 115,
    //% block="三角形"
    value116 = 116,
    //% block="万事如意"
    value117 = 117,
    //% block="工作顺利"
    value118 = 118,
    //% block="学习进步"
    value119 = 119,
    //% block="身体健康"
    value120 = 120,
    //% block="生日快乐"
    value121 = 121,
    //% block="天天向上"
    value122 = 122,
    //% block="欢迎"
    value123 = 123,
    //% block="光临"
    value124 = 124,
    //% block="使用"
    value125 = 125,
    //% block="德飞莱"
    value126 = 126,
    //% block="七星虫"
    value127 = 127,
    //% block="创客学习套件"
    value128 = 128,
    //% block="已"
    value129 = 129,
    //% block="是"
    value130 = 130,
    //% block="的"
    value131 = 131,
    //% block="变"
    value132 = 132,
    //% block="我太难了"
    value133 = 133,
    //% block="道路千万条，安全第一条"
    value134 = 134,
    //% block="好嗨哟"
    value135 = 135,
    //% block="盘他"
    value136 = 136,
    //% block="老铁"
    value137 = 137,
    //% block="我不要你觉得，我要我觉得"
    value138 = 138,
    //% block="你笑起来真好看"
    value139 = 139,
    //% block="我是"
    value140 = 140,
    //% block="机器人"
    value141 = 141,
    //% block="发现"
    value142 = 142,
    //% block="火情"
    value143 = 143,
    //% block="灭火"
    value144 = 144,
    //% block="烟雾"
    value145 = 145,
    //% block="报警"
    value146 = 146,
    //% block="计算器"
    value147 = 147,
    //% block="第"
    value148 = 148,
    //% block="声音"
    value149 = 149,
}
//% color="#AA278D" block="QXC_播放语音段"
namespace QXC_speech {
    //% block
    function sendingAddress(addr: number, dataPin: DigitalPin)   //发送地址
    {
        //pinMode(dataPin, OUTPUT);
        pins.digitalWritePin(dataPin, 0);
        pause(5);
        let DATA = (addr & 0x01);
        for (let i = 0; i < 8; i++) {
            if (DATA == 1) {
                //pinMode(dataPin, OUTPUT);
                pins.digitalWritePin(dataPin, 1);
                control.waitMicros(600);
                //pinMode(dataPin, OUTPUT);
                pins.digitalWritePin(dataPin, 0);
                control.waitMicros(200);

            }
            else if (DATA == 0) {
                //pinMode(dataPin, OUTPUT);
                pins.digitalWritePin(dataPin, 1);
                control.waitMicros(200);
                //pinMode(dataPin, OUTPUT);
                pins.digitalWritePin(dataPin, 0);
                control.waitMicros(600);
            }
            addr = (addr >> 1);
            DATA = (addr & 0x01);
        }
        pins.digitalWritePin(dataPin, 1);
    }
    //% block="播放语音 内容$addr引脚$dataPin"
    export function combinationPlay(addr: voiceNum, dataPin: DigitalPin)   //组合播放
    {
        sendingAddress(0xF3, dataPin);
        pause(2);
        sendingAddress(addr, dataPin);
        pause(2);
    }
    //% block="播放时间 时$hour|分$minute|秒$second|引脚$dataPin|"
    //% inlineInputMode=inline
    export function playFullCurrentTime(hour: number, minute: number, second: number, dataPin: DigitalPin) {
        combinationPlay(64, dataPin);
        combinationPlay(23, dataPin); //现在时间
        if (hour < 10)
            combinationPlay(hour, dataPin); //
        else {
            if ((hour / 10) != 1)
                combinationPlay(hour / 10, dataPin); //
            combinationPlay(10, dataPin); //
            if ((hour % 10) != 0)
                combinationPlay(hour % 10, dataPin); //
        }
        combinationPlay(15, dataPin); //点


        if (minute < 10)
            combinationPlay(minute, dataPin); //
        else {
            if ((minute / 10) != 1)
                combinationPlay(minute / 10, dataPin); //
            combinationPlay(10, dataPin); //
            if ((minute % 10) != 0)
                combinationPlay(minute % 10, dataPin); //
        }
        combinationPlay(29, dataPin); //分


        if (second < 10)
            combinationPlay(second, dataPin); //
        else {
            if ((second / 10) != 1)
                combinationPlay(second / 10, dataPin); //
            combinationPlay(10, dataPin); //
            if ((second % 10) != 0)
                combinationPlay(second % 10, dataPin); //
        }
        combinationPlay(30, dataPin); //秒
    }
    //% block="播放时间 时$hour|分$minute|引脚$dataPin|"
    export function playCurrentTime(hour: number, minute: number, dataPin: DigitalPin) {
        combinationPlay(64, dataPin);
        combinationPlay(23, dataPin); //现在时间
        if (hour < 10)
            combinationPlay(hour, dataPin); //
        else {
            if ((hour / 10) != 1)
                combinationPlay(hour / 10, dataPin); //
            combinationPlay(10, dataPin); //
            if ((hour % 10) != 0)
                combinationPlay(hour % 10, dataPin); //
        }
        combinationPlay(15, dataPin); //点


        if (minute < 10)
            combinationPlay(minute, dataPin); //
        else {
            if ((minute / 10) != 1)
                combinationPlay(minute / 10, dataPin); //
            combinationPlay(10, dataPin); //
            if ((minute % 10) != 0)
                combinationPlay(minute % 10, dataPin); //
        }
        combinationPlay(29, dataPin); //分
    }
    //% block="播放湿度$humidity引脚$dataPin"
    export function playHumidity(humidity: number, dataPin: DigitalPin) {
        combinationPlay(18, dataPin); //湿度
        combinationPlay(21, dataPin); //百分之
        if (humidity < 10)
            combinationPlay(humidity, dataPin); //
        else {
            combinationPlay(humidity / 10, dataPin); //
            combinationPlay(10, dataPin); //播放10
            if ((humidity % 10) != 0)
                combinationPlay(humidity % 10, dataPin); //
        }
    }

}

//////////////////////////////////////////////////////////////////////
declare interface Math {
    floor(x: number): number;
}


//% color=#27bab0 icon="\uf26c"
//% block="OLED_SSD1306显示屏 "
namespace QXC_OLED {
    let font: Buffer;


    const SSD1306_SETCONTRAST = 0x81
    const SSD1306_SETCOLUMNADRESS = 0x21
    const SSD1306_SETPAGEADRESS = 0x22
    const SSD1306_DISPLAYALLON_RESUME = 0xA4
    const SSD1306_DISPLAYALLON = 0xA5
    const SSD1306_NORMALDISPLAY = 0xA6
    const SSD1306_INVERTDISPLAY = 0xA7
    const SSD1306_DISPLAYOFF = 0xAE
    const SSD1306_DISPLAYON = 0xAF
    const SSD1306_SETDISPLAYOFFSET = 0xD3
    const SSD1306_SETCOMPINS = 0xDA
    const SSD1306_SETVCOMDETECT = 0xDB
    const SSD1306_SETDISPLAYCLOCKDIV = 0xD5
    const SSD1306_SETPRECHARGE = 0xD9
    const SSD1306_SETMULTIPLEX = 0xA8
    const SSD1306_SETLOWCOLUMN = 0x00
    const SSD1306_SETHIGHCOLUMN = 0x10
    const SSD1306_SETSTARTLINE = 0x40
    const SSD1306_MEMORYMODE = 0x20
    const SSD1306_COMSCANINC = 0xC0
    const SSD1306_COMSCANDEC = 0xC8
    const SSD1306_SEGREMAP = 0xA0
    const SSD1306_CHARGEPUMP = 0x8D
    const chipAdress = 0x3C
    const xOffset = 0
    const yOffset = 0
    let charX = 0
    let charY = 0
    let displayWidth = 128
    let displayHeight = 64 / 8
    let screenSize = 0
    //let font: Array<Array<number>>
    let loadStarted: boolean;
    let loadPercent: number;
    function command(cmd: number) {
        let buf = pins.createBuffer(2)
        buf[0] = 0x00
        buf[1] = cmd
        pins.i2cWriteBuffer(chipAdress, buf, false)
    }
    //% block="清除OLED显示"
    //% weight=3
    export function clear() {
        loadStarted = false
        loadPercent = 0
        command(SSD1306_SETCOLUMNADRESS)
        command(0x00)
        command(displayWidth - 1)
        command(SSD1306_SETPAGEADRESS)
        command(0x00)
        command(displayHeight - 1)
        let data = pins.createBuffer(17);
        data[0] = 0x40; // Data Mode
        for (let i = 1; i < 17; i++) {
            data[i] = 0x00
        }
        // send display buffer in 16 byte chunks
        for (let i = 0; i < screenSize; i += 16) {
            pins.i2cWriteBuffer(chipAdress, data, false)
        }
        charX = xOffset
        charY = yOffset
    }

    function drawLoadingFrame() {
        command(SSD1306_SETCOLUMNADRESS)
        command(0x00)
        command(displayWidth - 1)
        command(SSD1306_SETPAGEADRESS)
        command(0x00)
        command(displayHeight - 1)
        let col = 0
        let page = 0
        let data = pins.createBuffer(17);
        data[0] = 0x40; // Data Mode
        let i = 1
        for (let page = 0; page < displayHeight; page++) {
            for (let col = 0; col < displayWidth; col++) {
                if (page === 3 && col > 12 && col < displayWidth - 12) {
                    data[i] = 0x60
                } else if (page === 5 && col > 12 && col < displayWidth - 12) {
                    data[i] = 0x06
                } else if (page === 4 && (col === 12 || col === 13 || col === displayWidth - 12 || col === displayWidth - 13)) {
                    data[i] = 0xFF
                } else {
                    data[i] = 0x00
                }
                if (i === 16) {
                    pins.i2cWriteBuffer(chipAdress, data, false)
                    i = 1
                } else {
                    i++
                }

            }
        }
        charX = 30
        charY = 2
        writeString("Loading:")
    }
    function drawLoadingBar(percent: number) {
        charX = 78
        charY = 2
        let num = Math.floor(percent)
        writeNum(num)
        writeString("%")
        let width = displayWidth - 14 - 13
        let lastStart = width * (loadPercent / displayWidth)
        command(SSD1306_SETCOLUMNADRESS)
        command(14 + lastStart)
        command(displayWidth - 13)
        command(SSD1306_SETPAGEADRESS)
        command(4)
        command(5)
        let data = pins.createBuffer(2);
        data[0] = 0x40; // Data Mode
        data[1] = 0x7E
        for (let i = lastStart; i < width * (Math.floor(percent) / 100); i++) {
            pins.i2cWriteBuffer(chipAdress, data, false)
        }
        loadPercent = num
    }

    //% block="画进展条 $percent\\%"
    //% percent.min=0 percent.max=100
    //% weight=2
    export function drawLoading(percent: number) {
        if (loadStarted) {
            drawLoadingBar(percent)
        } else {
            drawLoadingFrame()
            drawLoadingBar(percent)
            loadStarted = true
        }
    }


    //% block="显示字符串（无新行） $str"
    //% weight=6
    export function writeString(str: string) {
        for (let i = 0; i < str.length; i++) {
            if (charX > displayWidth - 6) {
                newLine()
            }
            drawChar(charX, charY, str.charAt(i))
            charX += 6
        }
    }
    //% block="显示数字（无新行） $n"
    //% weight=5
    export function writeNum(n: number) {
        let numString = n.toString()
        writeString(numString)
    }
    //% block="显示字符串 $str"
    //% weight=8
    export function writeStringNewLine(str: string) {
        writeString(str)
        newLine()
    }
    //% block="显示数字 $n"
    //% weight=7
    export function writeNumNewLine(n: number) {
        writeNum(n)
        newLine()
    }
    //% block="插入新行"
    //% weight=4
    export function newLine() {
        charY++
        charX = xOffset
    }
    function drawChar(x: number, y: number, c: string) {
        command(SSD1306_SETCOLUMNADRESS)
        command(x)
        command(x + 5)
        command(SSD1306_SETPAGEADRESS)
        command(y)
        command(y + 1)
        let line = pins.createBuffer(2)
        line[0] = 0x40
        for (let i = 0; i < 6; i++) {
            if (i === 5) {
                line[1] = 0x00
            } else {
                let charIndex = c.charCodeAt(0)
                let charNumber = font.getNumber(NumberFormat.UInt8BE, 5 * charIndex + i)
                line[1] = charNumber

            }
            pins.i2cWriteBuffer(chipAdress, line, false)
        }

    }
    function drawShape(pixels: Array<Array<number>>) {
        let x1 = displayWidth
        let y1 = displayHeight * 8
        let x2 = 0
        let y2 = 0
        for (let i = 0; i < pixels.length; i++) {
            if (pixels[i][0] < x1) {
                x1 = pixels[i][0]
            }
            if (pixels[i][0] > x2) {
                x2 = pixels[i][0]
            }
            if (pixels[i][1] < y1) {
                y1 = pixels[i][1]
            }
            if (pixels[i][1] > y2) {
                y2 = pixels[i][1]
            }
        }
        let page1 = Math.floor(y1 / 8)
        let page2 = Math.floor(y2 / 8)
        let line = pins.createBuffer(2)
        line[0] = 0x40
        for (let x = x1; x <= x2; x++) {
            for (let page = page1; page <= page2; page++) {
                line[1] = 0x00
                for (let i = 0; i < pixels.length; i++) {
                    if (pixels[i][0] === x) {
                        if (Math.floor(pixels[i][1] / 8) === page) {
                            line[1] |= Math.pow(2, (pixels[i][1] % 8))
                        }
                    }
                }
                if (line[1] !== 0x00) {
                    command(SSD1306_SETCOLUMNADRESS)
                    command(x)
                    command(x + 1)
                    command(SSD1306_SETPAGEADRESS)
                    command(page)
                    command(page + 1)
                    //line[1] |= pins.i2cReadBuffer(chipAdress, 2)[1]
                    pins.i2cWriteBuffer(chipAdress, line, false)
                }
            }
        }
    }

    //% block="划线 从:|x: $x0 y: $y0 到| x: $x1 y: $y1"
    //% x0.defl=0
    //% y0.defl=0
    //% x1.defl=20
    //% y1.defl=20
    //% weight=1
    export function drawLine(x0: number, y0: number, x1: number, y1: number) {
        let pixels: Array<Array<number>> = []
        let kx: number, ky: number, c: number, i: number, xx: number, yy: number, dx: number, dy: number;
        let targetX = x1
        let targetY = y1
        x1 -= x0; kx = 0; if (x1 > 0) kx = +1; if (x1 < 0) { kx = -1; x1 = -x1; } x1++;
        y1 -= y0; ky = 0; if (y1 > 0) ky = +1; if (y1 < 0) { ky = -1; y1 = -y1; } y1++;
        if (x1 >= y1) {
            c = x1
            for (i = 0; i < x1; i++, x0 += kx) {
                pixels.push([x0, y0])
                c -= y1; if (c <= 0) { if (i != x1 - 1) pixels.push([x0 + kx, y0]); c += x1; y0 += ky; if (i != x1 - 1) pixels.push([x0, y0]); }
                if (pixels.length > 20) {
                    drawShape(pixels)
                    pixels = []
                    drawLine(x0, y0, targetX, targetY)
                    return
                }
            }
        } else {
            c = y1
            for (i = 0; i < y1; i++, y0 += ky) {
                pixels.push([x0, y0])
                c -= x1; if (c <= 0) { if (i != y1 - 1) pixels.push([x0, y0 + ky]); c += y1; x0 += kx; if (i != y1 - 1) pixels.push([x0, y0]); }
                if (pixels.length > 20) {
                    drawShape(pixels)
                    pixels = []
                    drawLine(x0, y0, targetX, targetY)
                    return
                }
            }
        }
        drawShape(pixels)
    }

    //% block="画长方形 从:|x: $x0 y: $y0 到| x: $x1 y: $y1"
    //% x0.defl=0
    //% y0.defl=0
    //% x1.defl=20
    //% y1.defl=20
    //% weight=0
    export function drawRectangle(x0: number, y0: number, x1: number, y1: number) {
        drawLine(x0, y0, x1, y0)
        drawLine(x0, y1, x1, y1)
        drawLine(x0, y0, x0, y1)
        drawLine(x1, y0, x1, y1)
    }
    //% block="初始化 OLED 宽 $width 高 $height"
    //% width.defl=128
    //% height.defl=64
    //% weight=9
    export function init(width: number, height: number) {
        command(SSD1306_DISPLAYOFF);
        command(SSD1306_SETDISPLAYCLOCKDIV);
        command(0x80);                                  // the suggested ratio 0x80
        command(SSD1306_SETMULTIPLEX);
        command(0x3F);
        command(SSD1306_SETDISPLAYOFFSET);
        command(0x0);                                   // no offset
        command(SSD1306_SETSTARTLINE | 0x0);            // line #0
        command(SSD1306_CHARGEPUMP);
        command(0x14);
        command(SSD1306_MEMORYMODE);
        command(0x00);                                  // 0x0 act like ks0108
        command(SSD1306_SEGREMAP | 0x1);
        command(SSD1306_COMSCANDEC);
        command(SSD1306_SETCOMPINS);
        command(0x12);
        command(SSD1306_SETCONTRAST);
        command(0xCF);
        command(SSD1306_SETPRECHARGE);
        command(0xF1);
        command(SSD1306_SETVCOMDETECT);
        command(0x40);
        command(SSD1306_DISPLAYALLON_RESUME);
        command(SSD1306_NORMALDISPLAY);
        command(SSD1306_DISPLAYON);
        displayWidth = width
        displayHeight = height / 8
        screenSize = displayWidth * displayHeight
        charX = xOffset
        charY = yOffset
        font = hex`
    0000000000
    3E5B4F5B3E
    3E6B4F6B3E
    1C3E7C3E1C
    183C7E3C18
    1C577D571C
    1C5E7F5E1C
    00183C1800
    FFE7C3E7FF
    0018241800
    FFE7DBE7FF
    30483A060E
    2629792926
    407F050507
    407F05253F
    5A3CE73C5A
    7F3E1C1C08
    081C1C3E7F
    14227F2214
    5F5F005F5F
    06097F017F
    006689956A
    6060606060
    94A2FFA294
    08047E0408
    10207E2010
    08082A1C08
    081C2A0808
    1E10101010
    0C1E0C1E0C
    30383E3830
    060E3E0E06
    0000000000
    00005F0000
    0007000700
    147F147F14
    242A7F2A12
    2313086462
    3649562050
    0008070300
    001C224100
    0041221C00
    2A1C7F1C2A
    08083E0808
    0080703000
    0808080808
    0000606000
    2010080402
    3E5149453E
    00427F4000
    7249494946
    2141494D33
    1814127F10
    2745454539
    3C4A494931
    4121110907
    3649494936
    464949291E
    0000140000
    0040340000
    0008142241
    1414141414
    0041221408
    0201590906
    3E415D594E
    7C1211127C
    7F49494936
    3E41414122
    7F4141413E
    7F49494941
    7F09090901
    3E41415173
    7F0808087F
    00417F4100
    2040413F01
    7F08142241
    7F40404040
    7F021C027F
    7F0408107F
    3E4141413E
    7F09090906
    3E4151215E
    7F09192946
    2649494932
    03017F0103
    3F4040403F
    1F2040201F
    3F4038403F
    6314081463
    0304780403
    6159494D43
    007F414141
    0204081020
    004141417F
    0402010204
    4040404040
    0003070800
    2054547840
    7F28444438
    3844444428
    384444287F
    3854545418
    00087E0902
    18A4A49C78
    7F08040478
    00447D4000
    2040403D00
    7F10284400
    00417F4000
    7C04780478
    7C08040478
    3844444438
    FC18242418
    18242418FC
    7C08040408
    4854545424
    04043F4424
    3C4040207C
    1C2040201C
    3C4030403C
    4428102844
    4C9090907C
    4464544C44
    0008364100
    0000770000
    0041360800
    0201020402
    3C2623263C
    1EA1A16112
    3A4040207A
    3854545559
    2155557941
    2154547841
    2155547840
    2054557940
    0C1E527212
    3955555559
    3954545459
    3955545458
    0000457C41
    0002457D42
    0001457C40
    F0292429F0
    F0282528F0
    7C54554500
    2054547C54
    7C0A097F49
    3249494932
    3248484832
    324A484830
    3A4141217A
    3A42402078
    009DA0A07D
    3944444439
    3D4040403D
    3C24FF2424
    487E494366
    2B2FFC2F2B
    FF0929F620
    C0887E0903
    2054547941
    0000447D41
    3048484A32
    384040227A
    007A0A0A72
    7D0D19317D
    2629292F28
    2629292926
    30484D4020
    3808080808
    0808080838
    2F10C8ACBA
    2F102834FA
    00007B0000
    08142A1422
    22142A1408
    AA005500AA
    AA55AA55AA
    000000FF00
    101010FF00
    141414FF00
    1010FF00FF
    1010F010F0
    141414FC00
    1414F700FF
    0000FF00FF
    1414F404FC
    141417101F
    10101F101F
    1414141F00
    101010F000
    0000001F10
    1010101F10
    101010F010
    000000FF10
    1010101010
    101010FF10
    000000FF14
    0000FF00FF
    00001F1017
    0000FC04F4
    1414171017
    1414F404F4
    0000FF00F7
    1414141414
    1414F700F7
    1414141714
    10101F101F
    141414F414
    1010F010F0
    00001F101F
    0000001F14
    000000FC14
    0000F010F0
    1010FF10FF
    141414FF14
    1010101F00
    000000F010
    FFFFFFFFFF
    F0F0F0F0F0
    FFFFFF0000
    000000FFFF
    0F0F0F0F0F
    3844443844
    7C2A2A3E14
    7E02020606
    027E027E02
    6355494163
    3844443C04
    407E201E20
    06027E0202
    99A5E7A599
    1C2A492A1C
    4C7201724C
    304A4D4D30
    3048784830
    BC625A463D
    3E49494900
    7E0101017E
    2A2A2A2A2A
    44445F4444
    40514A4440
    40444A5140
    0000FF0103
    E080FF0000
    08086B6B08
    3612362436
    060F090F06
    0000181800
    0000101000
    3040FF0101
    001F01011E
    00191D1712
    003C3C3C3C
    0000000000`
        loadStarted = false
        loadPercent = 0
        clear()
    }
}
////////////////////////////////////////////////////////////

/**
 * MakeCode editor extension for DHT11 and DHT22 humidity/temperature sensors
 * by Alan Wang
 */
//% block="温湿度DHT11/DHT22" weight=100 color=#ff8f3f icon="\uf043"
namespace QXC_dht11_dht22 {

    let _temperature: number = -999.0
    let _humidity: number = 
    -999.0
    let _readSuccessful: boolean = false

    /**
    * Query data from DHT11/DHT22 sensor. If you are using 4 pins/no PCB board versions, you'll need to pull up the data pin. 
    * It is also recommended to wait 1 (DHT11) or 2 (DHT22) seconds between each query.
    */
    //% block="初始化 查询$DHT|数据引脚 $dataPin|引脚上拉 $pullUp|串口输出 $serialOtput|查询后等待2秒$wait"
    //% pullUp.defl=true
    //% serialOtput.defl=false
    //% wait.defl=true
    //% blockExternalInputs=true
    export function queryData(DHT: DHTtype, dataPin: DigitalPin, pullUp: boolean, serialOtput: boolean, wait: boolean) {

        //initialize
        let startTime: number = 0
        let endTime: number = 0
        let checksum: number = 0
        let checksumTmp: number = 0
        let dataArray: boolean[] = []
        let resultArray: number[] = []
        for (let index = 0; index < 40; index++) dataArray.push(false)
        for (let index = 0; index < 5; index++) resultArray.push(0)
        _humidity = -999.0
        _temperature = -999.0
        _readSuccessful = false

        startTime = input.runningTimeMicros()

        //request data
        pins.digitalWritePin(dataPin, 0) //begin protocol
        basic.pause(18)
        if (pullUp) pins.setPull(dataPin, PinPullMode.PullUp) //pull up data pin if needed
        pins.digitalReadPin(dataPin)
        control.waitMicros(20)
        while (pins.digitalReadPin(dataPin) == 1);
        while (pins.digitalReadPin(dataPin) == 0); //sensor response
        while (pins.digitalReadPin(dataPin) == 1); //sensor response

        //read data (5 bytes)
        for (let index = 0; index < 40; index++) {
            while (pins.digitalReadPin(dataPin) == 1);
            while (pins.digitalReadPin(dataPin) == 0);
            control.waitMicros(28)
            //if sensor pull up data pin for more than 28 us it means 1, otherwise 0
            if (pins.digitalReadPin(dataPin) == 1) dataArray[index] = true
        }

        endTime = input.runningTimeMicros()

        //convert byte number array to integer
        for (let index = 0; index < 5; index++)
            for (let index2 = 0; index2 < 8; index2++)
                if (dataArray[8 * index + index2]) resultArray[index] += 2 ** (7 - index2)

        //verify checksum
        checksumTmp = resultArray[0] + resultArray[1] + resultArray[2] + resultArray[3]
        checksum = resultArray[4]
        if (checksumTmp >= 512) checksumTmp -= 512
        if (checksumTmp >= 256) checksumTmp -= 256
        if (checksum == checksumTmp) _readSuccessful = true

        //read data if checksum ok
        if (_readSuccessful) {
            if (DHT == DHTtype.DHT11) {
                //DHT11
                _humidity = resultArray[0] + resultArray[1] / 100
                _temperature = resultArray[2] + resultArray[3] / 100
            } else {
                //DHT22
                let temp_sign: number = 1
                if (resultArray[2] >= 128) {
                    resultArray[2] -= 128
                    temp_sign = -1
                }
                _humidity = (resultArray[0] * 256 + resultArray[1]) / 10
                _temperature = (resultArray[2] * 256 + resultArray[3]) / 10 * temp_sign
            }
        }

        //serial output
        if (serialOtput) {
            let DHTstr: string = ""
            if (DHT == DHTtype.DHT11) DHTstr = "DHT11"
            else DHTstr = "DHT22"
            serial.writeLine(DHTstr + " query completed in " + (endTime - startTime) + " microseconds")
            if (_readSuccessful) {
                serial.writeLine("Checksum ok")
                serial.writeLine("Humidity: " + _humidity + " %")
                serial.writeLine("Temperature: " + _temperature + " *C")
            } else {
                serial.writeLine("Checksum error")
            }
            serial.writeLine("----------------------------------------")
        }

        //wait 2 sec after query if needed
        if (wait) basic.pause(2000)

    }

    /**
    * Read humidity/temperature data from lastest query of DHT11/DHT22
    */
    //% block="读取 $data"
    export function readData(data: dataType): number {
        return data == dataType.humidity ? _humidity : _temperature
    }

    /**
    * Determind if last query is successful (checksum ok)
    */
    //% block="上次查询成功?"
    export function readDataSuccessful(): boolean {
        return _readSuccessful
    }

}

enum DHTtype {
    //% block="DHT11"
    DHT11,
    //% block="DHT22"
    DHT22,
}

enum dataType {
    //% block="湿度"
    humidity,
    //% block="温度"
    temperature,
}
////////////////////////////////////////////////////////////////
/**
* makecode DS1307 RTC Package.
* From microbit/micropython Chinese community.
* http://www.micropython.org.cn
*/
/*let enum clock_List{
//%block="年"
DS1307_REG_YEAR = 6
//%block="月"
DS1307_REG_MONTH = 5
//%block="日"
DS1307_REG_DAY = 4
//%block="时"
DS1307_REG_HOUR = 2
//%block="分"
DS1307_REG_MINUTE = 1
//%block="秒"
DS1307_REG_SECOND = 0
//%block="周"
DS1307_REG_WEEKDAY = 3


}*/
/**
 * DS1307 block
 */
//% weight=20 color=#806666 icon="\uf017" block="DS1307 实时时钟"
namespace QXC_DS1307 {
    let DS1307_I2C_ADDR = 104;
    
    let DS1307_REG_SECOND = 0
    let DS1307_REG_MINUTE = 1
    let DS1307_REG_HOUR = 2
    let DS1307_REG_WEEKDAY = 3
    let DS1307_REG_DAY = 4
    let DS1307_REG_MONTH = 5
    let DS1307_REG_YEAR = 6
    let DS1307_REG_CTRL = 7
    let DS1307_REG_RAM = 8

    /**
     * set ds1307's reg
     */
    function setReg(reg: number, dat: number): void {
        let buf = pins.createBuffer(2);
        buf[0] = reg;
        buf[1] = dat;
        pins.i2cWriteBuffer(DS1307_I2C_ADDR, buf);
    }

    /**
     * get ds1307's reg
     */
    function getReg(reg: number): number {
        pins.i2cWriteNumber(DS1307_I2C_ADDR, reg, NumberFormat.UInt8BE);
        return pins.i2cReadNumber(DS1307_I2C_ADDR, NumberFormat.UInt8BE);
    }

    /**
     * convert a Hex data to Dec
     */
    function HexToDec(dat: number): number {
        return (dat >> 4) * 10 + (dat % 16);
    }

    /**
     * convert a Dec data to Hex
     */
    function DecToHex(dat: number): number {
        return Math.idiv(dat, 10) * 16 + (dat % 10)
    }

    /**
     * start ds1307 (go on)
     */
    //% blockId="DS1307_START" block="启动"
    //% weight=52 blockGap=8
    //% parts=DS1307 trackArgs=0
    export function start() {
        let t = getSecond()
        setSecond(t & 0x7f)
    }

    /**
     * stop ds1307 (pause)
     */
    //% blockId="DS1307_STOP" block="暂停"
    //% weight=51 blockGap=8
    //% parts=DS1307 trackArgs=0
    export function stop() {
        let t = getSecond()
        setSecond(t | 0x80)
    }

    /**
     * get Year
     */
    //% blockId="DS1307_GET_YEAR" block="年"
    //% weight=99 blockGap=8
    //% parts=DS1307 trackArgs=0
    export function getYear(): number {
        return Math.min(HexToDec(getReg(DS1307_REG_YEAR)), 99) + 2000
    }

    /**
     * set year
     * @param dat is the Year will be set, eg: 2018
     */
    //% blockId="DS1307_SET_YEAR" block="设置 年 %dat"
    //% weight=69 blockGap=8
    //% parts=DS1307 trackArgs=0
    export function setYear(dat: number): void {
        setReg(DS1307_REG_YEAR, DecToHex(dat % 100))
    }

    /**
     * get Month
     */
    //% blockId="DS1307_GET_MONTH" block="月"
    //% weight=98 blockGap=8
    //% parts=DS1307 trackArgs=0
    export function getMonth(): number {
        return Math.max(Math.min(HexToDec(getReg(DS1307_REG_MONTH)), 12), 1)
    }

    /**
     * set month
     * @param dat is Month will be set.  eg: 2
     */
    //% blockId="DS1307_SET_MONTH" block="设置 月 %dat"
    //% weight=68 blockGap=8
    //% dat.min=1 dat.max=12
    //% parts=DS1307 trackArgs=0
    export function setMonth(dat: number): void {
        setReg(DS1307_REG_MONTH, DecToHex(dat % 13))
    }

    /**
     * get Day
     */
    //% blockId="DS1307_GET_DAY" block="日"
    //% weight=97 blockGap=8
    //% parts=DS1307 trackArgs=0
    export function getDay(): number {
        return Math.max(Math.min(HexToDec(getReg(DS1307_REG_DAY)), 31), 1)
    }

    /**
     * set day
     * @param dat is the Day will be set, eg: 15
     */
    //% blockId="DS1307_SET_DAY" block="设置 日 %dat"
    //% weight=67 blockGap=8
    //% dat.min=1 dat.max=31
    //% parts=DS1307 trackArgs=0
    export function setDay(dat: number): void {
        setReg(DS1307_REG_DAY, DecToHex(dat % 32))
    }

    /**
     * get Week Day
     */
    //% blockId="DS1307_GET_WEEKDAY" block="周"
    //% weight=96 blockGap=8
    //% parts=DS1307 trackArgs=0
    export function getWeekday(): number {
        return Math.max(Math.min(HexToDec(getReg(DS1307_REG_WEEKDAY)), 7), 1)
    }

    /**
     * set weekday
     * @param dat is the Week Day will be set, eg: 4
     */
    //% blockId="DS1307_SET_WEEKDAY" block="设置 周 %dat"
    //% weight=66 blockGap=8
    //% dat.min=1 dat.max=7
    //% parts=DS1307 trackArgs=0
    export function setWeekday(dat: number): void {
        setReg(DS1307_REG_WEEKDAY, DecToHex(dat % 8))
    }

    /**
     * get Hour
     */
    //% blockId="DS1307_GET_HOUR" block="时"
    //% weight=95 blockGap=8
    //% parts=DS1307 trackArgs=0
    export function getHour(): number {
        return Math.min(HexToDec(getReg(DS1307_REG_HOUR)), 23)
    }

    /**
     * set hour
     * @param dat is the Hour will be set, eg: 0
     */
    //% blockId="DS1307_SET_HOUR" block="设置 时 %dat"
    //% weight=65 blockGap=8
    //% dat.min=0 dat.max=23
    //% parts=DS1307 trackArgs=0
    export function setHour(dat: number): void {
        setReg(DS1307_REG_HOUR, DecToHex(dat % 24))
    }

    /**
     * get Minute
     */
    //% blockId="DS1307_GET_MINUTE" block="分"
    //% weight=94 blockGap=8
    //% parts=DS1307 trackArgs=0
    export function getMinute(): number {
        return Math.min(HexToDec(getReg(DS1307_REG_MINUTE)), 59)
    }

    /**
     * set minute
     * @param dat is the Minute will be set, eg: 0
     */
    //% blockId="DS1307_SET_MINUTE" block="设置 分 %dat"
    //% weight=64 blockGap=8
    //% dat.min=0 dat.max=59
    //% parts=DS1307 trackArgs=0
    export function setMinute(dat: number): void {
        setReg(DS1307_REG_MINUTE, DecToHex(dat % 60))
    }

    /**
     * get Second
     */
    //% blockId="DS1307_GET_SECOND" block="秒"
    //% weight=93 blockGap=8
    //% parts=DS1307 trackArgs=0
    export function getSecond(): number {
        return Math.min(HexToDec(getReg(DS1307_REG_SECOND)), 59)
    }

    /**
     * set second
     * @param dat is the Second will be set, eg: 0
     */
    //% blockId="DS1307_SET_SECOND" block="设置 秒 %dat"
    //% weight=63 blockGap
    //% dat.min=0 dat.max=59
    //% parts=DS1307 trackArgs=0
    export function setSecond(dat: number): void {
        setReg(DS1307_REG_SECOND, DecToHex(dat % 60))
    }

    /**
     * set Date and Time
     * @param year is the Year will be set, eg: 2018
     * @param month is the Month will be set, eg: 2
     * @param day is the Day will be set, eg: 15
     * @param weekday is the Weekday will be set, eg: 4
     * @param hour is the Hour will be set, eg: 0
     * @param minute is the Minute will be set, eg: 0
     * @param second is the Second will be set, eg: 0
     */
    //% blockId="DS1307_SET_DATETIME" block="设置 年 %year|月 %month|日 %day|周 %weekday|时 %hour|分 %minute|秒 %second"
    //% weight=60 blockGap
    //% parts=DS1307 trackArgs=0
    export function DateTime(year: number, month: number, day: number, weekday: number, hour: number, minute: number, second: number): void {
        let buf = pins.createBuffer(8);
        buf[0] = DS1307_REG_SECOND;
        buf[1] = DecToHex(second % 60);
        buf[2] = DecToHex(minute % 60);
        buf[3] = DecToHex(hour % 24);
        buf[4] = DecToHex(weekday % 8);
        buf[5] = DecToHex(day % 32);
        buf[6] = DecToHex(month % 13);
        buf[7] = DecToHex(year % 100);
        pins.i2cWriteBuffer(DS1307_I2C_ADDR, buf)
    }

}

//////////////////////////////////////////////////////////
enum stepUnit {
    //% block="步"
    Steps,
    //% block="圈"
    Rotations
}

//% color=#1f49bf icon="\uf013" block="4相步进电机"
namespace edit_stepperMotor {

    export class Motor {

        private input1: DigitalPin;
        private input2: DigitalPin;
        private input3: DigitalPin;
        private input4: DigitalPin;
        private delay: number;
        private state: number;

        setPins(in1: DigitalPin, in2: DigitalPin, in3: DigitalPin, in4: DigitalPin): void {
            // send pulse
            this.input1 = in1;
            this.input2 = in2;
            this.input3 = in3;
            this.input4 = in4;
        }

        setState(stateNum: number): void {
            this.state = stateNum;
        }

        //% blockId=set_motor_calibration block="%motor|设置步进时长 %delayNum|ms"
        //% weight=60 blockGap=8
        setDelay(delayNum: number): void {
            this.delay = delayNum;
        }

        /* Functions for running a stepper motor by steps */

        steps(direction: number): void {
            if (this.state == 0) {
                pins.digitalWritePin(this.input1, 0);
                pins.digitalWritePin(this.input2, 0);
                pins.digitalWritePin(this.input3, 0);
                pins.digitalWritePin(this.input4, 0);
            } else if (this.state == 1) {
                pins.digitalWritePin(this.input1, 1);
                pins.digitalWritePin(this.input2, 0);
                pins.digitalWritePin(this.input3, 0);
                pins.digitalWritePin(this.input4, 1);
            } else if (this.state == 2) {
                pins.digitalWritePin(this.input1, 0);
                pins.digitalWritePin(this.input2, 0);
                pins.digitalWritePin(this.input3, 1);
                pins.digitalWritePin(this.input4, 1);
            } else if (this.state == 3) {
                pins.digitalWritePin(this.input1, 0);
                pins.digitalWritePin(this.input2, 1);
                pins.digitalWritePin(this.input3, 1);
                pins.digitalWritePin(this.input4, 0);
            } else if (this.state == 4) {
                pins.digitalWritePin(this.input1, 1);
                pins.digitalWritePin(this.input2, 1);
                pins.digitalWritePin(this.input3, 0);
                pins.digitalWritePin(this.input4, 0);
            }

            this.state = this.state + direction;
            if (this.state < 1) {
                this.state = 4;
            } else if (this.state > 4) {
                this.state = 1;
            }

        }

        //% blockId=moveAntiClockwise block="运行 %motor| %steps|%unit| 逆时针"
        //% weight=85 blockGap=8
        moveAntiClockwise(steps: number, unit: stepUnit): void {

            switch (unit) {
                case stepUnit.Rotations: steps = steps * 2056; //2056 steps = approximately 1 round
                case stepUnit.Steps: steps = steps;
            }

            for (let i = 0; i < steps; i++) {
                this.steps(1);
                basic.pause(this.delay);
            }

            this.state = 0;
        }

        //% blockId=moveClockwise block="运行 %motor| %steps|%unit| 顺时针"
        //% weight=84 blockGap=8
        moveClockwise(steps: number, unit: stepUnit): void {

            switch (unit) {
                case stepUnit.Rotations: steps = steps * 2056; //2056 steps = approximately 1 round
                case stepUnit.Steps: steps = steps;
            }

            for (let i = 0; i < steps; i++) {
                this.steps(-1);
                basic.pause(this.delay);
            }

            this.state = 0;
        }

        //% blockId=stopMotor block="停止 %motor"
        //% weight=70 blockGap=8
        stopMotor(): void {
            this.state = 0;
        }


    }

    /**
     * Create a new stepper motor with connected pins at @param.
     * @param 4 pins where the motor is connected.
     */
    //% blockId="stepperMotor_setMotor" block="电机接口设置|in1 %in1|in2 %in2|in3 %in3|in4 %in4"
    //% weight=90 blockGap=8
    //% parts="motor"
    //% blockSetVariable=motor
    export function createMotor(in1: DigitalPin, in2: DigitalPin, in3: DigitalPin, in4: DigitalPin): Motor {
        let motor = new Motor();
        motor.setPins(in1, in2, in3, in4);
        motor.setState(0);
        motor.setDelay(1);
        return motor;
    }

}
///////////////////////////////////////////////////////////

enum ADKeys {
    up = 1,
    left = 2,
    down = 3,
    right = 4,
    A = 5,
    C = 6,
    B = 7,
    D = 8
}

//% color=#ff0000 icon="\uf013" block="QXC_ad键盘"
namespace adckeyboard {
    //%block="ad 键盘 键值$keycode 引脚$dataPin"
    export function ADKeyboard(keycode: ADKeys, dataPin: AnalogPin): boolean {
        let a: number = pins.analogReadPin(dataPin);
        if (a >= 90 && a <= 160 && keycode == 1) {
            return true;
        } else if (a >= 180 && a <= 240 && keycode == 2) {
            return true;
        } else if (a >= 280 && a <= 340 && keycode == 3) {
            return true;
        } else if (a >= 380 && a <= 430 && keycode == 4) {
            return true;
        } else if (a >= 470 && a <= 530 && keycode == 5) {
            return true;
        } else if (a >= 570 && a <= 640 && keycode == 6) {
            return true;
        } else if (a >= 680 && a <= 770 && keycode == 7) {
            return true;
        } else if (a >= 810 && a <= 900 && keycode == 8) {
            return true;
        } else return false;
    }
    //%block="ad 键盘键值 引脚$dataPin"
    export function ADKeyboardCode(dataPin: AnalogPin): number {
        let a: number = pins.analogReadPin(dataPin);
        if (a >= 90 && a <= 160 ) {
            return 1;
        } else if (a >= 180 && a <= 240 ) {
            return 2;
        } else if (a >= 280 && a <= 340 ) {
            return 3;
        } else if (a >= 380 && a <= 430 ) {
            return 4;
        } else if (a >= 470 && a <= 530 ) {
            return 5;
        } else if (a >= 570 && a <= 640 ) {
            return 6;
        } else if (a >= 680 && a <= 770 ) {
            return 7;
        } else if (a >= 810 && a <= 900 ) {
            return 8;
        } else return -1;
    }
}
////////////////////////////////////////////////////////////