cmake_minimum_required(VERSION 3.22.1)
project(minebot_native LANGUAGES CXX)

set(NODE_RUNTIME_LIB "${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so")
if(NOT EXISTS "${NODE_RUNTIME_LIB}")
    message(FATAL_ERROR "Pinned Node.js Mobile libnode.so not found for ${ANDROID_ABI}. The CI runtime setup step must run before Gradle.")
endif()

add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES IMPORTED_LOCATION "${NODE_RUNTIME_LIB}")

add_library(minebot-native SHARED native-lib.cpp)
target_include_directories(minebot-native PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/nodejs/include/node")

find_library(android-log log)
target_link_libraries(minebot-native node ${android-log})
