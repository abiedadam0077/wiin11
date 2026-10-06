package com.minebot.ai;

/** Native entry point for the embedded Node.js bot worker; this does not render UI or load a web page. */
final class NativeNode {
    static {
        System.loadLibrary("node");
        System.loadLibrary("minebot-native");
    }

    private NativeNode() { }

    static native int startNode(String workingDirectory, String[] arguments);
}
