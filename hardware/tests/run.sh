#!/bin/sh
# Builds and runs the firmware tests on this computer (no board needed):
#   1. the hardware-free logic classes
#   2. the whole node class against a fake Arduino
set -e
cd "$(dirname "$0")"
echo "== unit tests"
c++ -std=c++17 -Wall -Wextra -Wpedantic -O1 -o /tmp/smart_parking_unit test_firmware.cpp
/tmp/smart_parking_unit
echo
echo "== node tests (fake Arduino)"
c++ -std=c++17 -Wall -Wextra -Wno-unused-parameter -O1 -I arduino_stubs -o /tmp/smart_parking_node test_node.cpp
/tmp/smart_parking_node
