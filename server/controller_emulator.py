#!/usr/bin/env python3
import asyncio
import socket
import binascii
import time
import os
import subprocess
from joycontrol.memory import FlashMemory
from joycontrol.protocol import controller_protocol_factory
from joycontrol.server import create_hid_server
from joycontrol.controller import Controller
from joycontrol.controller_state import ControllerState, button_press, button_release, button_push

HOST = '127.0.0.1'  # Standard loopback interface address (localhost)
PORT = 65432        # Port to listen on (non-privileged ports are > 1023)

def debugPrint(message):
    debug = True
    if debug:
        print(message)

async def setup_controller():
    # set up controller -- switch should be in "paired / change grip" menu
    # spi_file = './spi_pro_DC68EBEC1123_Original.bin'
    # spi_flash = None
    # with open(spi_file, 'rb') as spi_flash_file:
    #     spi_flash = FlashMemory(spi_flash_file.read())
    spi_flash = FlashMemory()
    controller = Controller.PRO_CONTROLLER
    factory = controller_protocol_factory(controller, spi_flash=spi_flash)
    # start the emulated controller
    transport, protocol = await create_hid_server(factory, reconnect_bt_addr='58:2F:40:D3:41:F3') 
    # get a reference to the state being emulated.
    controller_state = protocol.get_controller_state()
    # wait for input to be accepted
    await controller_state.connect()
    # # some sample input
    # controller_state.button_state.set_button('a', True)
    # await controller_state.send()
    return controller_state

async def tcp_emulate(controller_state):
    # create data for inputs
    inputs = ['a','b','x','y','l','r','zl','zr','minus','plus','l_stick','r_stick','up','down','left','right','home','l_stick_horz','l_stick_vert','r_stick_horz','r_stick_vert']
    l_calibration = controller_state.l_stick_state.get_calibration()
    r_calibration = controller_state.l_stick_state.get_calibration()
    
    # listen for TCP connections
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('localhost', 1337))
        s.listen()
        conn, addr = s.accept()
        with conn:
            debugPrint('Connected via TCP')
            while True:
                data = conn.recv(42)
                if not data:
                    break
                bytes = bytearray(data)
                # code: 5 bits: button number
                #       1 bit: was button release between ticks?
                #       4 bits: how long was button held down? (ms * 4) (ignore if previous bit is 0, else ignore everything following)
                #       1 bit: was the value delivered negative?
                #       5 bits: what is the magnitude of the value? 
                first_byte = bytes[::2]
                second_byte = bytes[1::2] 

                for index, byte in enumerate(first_byte):        
                    button_pressed = first_byte[index] >> 3
                    released_indicator = (first_byte[index] << 5 & 0xff) >> 7
                    
                    if released_indicator:
                        # now we only care about next 4 bits
                        time_held = ((((first_byte[index] << 6) & 0xff) >> 6) * 4 + (second_byte[index] >> 6)) * 2
                        # switch reacts poorly to button_push
                        await button_press(controller_state, inputs[button_pressed])
                        await asyncio.sleep(max(30, time_held)/1000)
                        await button_release(controller_state, inputs[button_pressed])
                    else:
                        # now we only care about last 6 bits
                        neg_indicator = ((second_byte[index] << 2) & 0xff) >> 7
                        multiplier = 1
                        if neg_indicator:
                            multiplier = -1
                        value = (((second_byte[index] << 3) & 0xff) >> 3) / 31
                        value *= multiplier
                        debug = 'button {0} value = {1}'
                        debugPrint(debug.format(button_pressed, value))
                        if button_pressed < 17:
                            # button was changed
                            if value > 0.8:
                                controller_state.button_state.set_button(inputs[button_pressed], pushed=True)
                            else:
                                controller_state.button_state.set_button(inputs[button_pressed], pushed=False)
                        else:
                            # stick was shifted
                            if button_pressed == 17:
                                new_val = (int)((value + 1)*2047.5)
                                debugPrint('ls horz value is {0}'.format(new_val))
                                controller_state.l_stick_state.set_h(new_val)
                            elif button_pressed == 18:
                                new_val = (int)((value*-1 + 1)*2047.5)
                                debugPrint('ls vert value is {0}'.format(new_val))
                                controller_state.l_stick_state.set_v(new_val)
                            elif button_pressed == 19:
                                new_val = (int)((value + 1)*2047.5)
                                debugPrint('rs horz value is {0}'.format(new_val))
                                controller_state.r_stick_state.set_h(new_val)
                            elif button_pressed == 20:
                                new_val = (int)((value*-1 + 1)*2047.5)
                                debugPrint('rs vert value is {0}'.format(new_val))
                                controller_state.r_stick_state.set_v(new_val)
                            else:
                                debugPrint('unknown button was pressed')
                await controller_state.send()
                debugPrint('CONTROLLER STATE UPDATED')

loop = asyncio.get_event_loop()
state = loop.run_until_complete(setup_controller())
debugPrint('Connected to the Switch! Listening for TCP...')
loop.run_until_complete(tcp_emulate(state))

