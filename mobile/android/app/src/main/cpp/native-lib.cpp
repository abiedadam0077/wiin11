#include <jni.h>
#include <node.h>

#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <string>
#include <unistd.h>
#include <vector>

extern "C" JNIEXPORT jint JNICALL
Java_com_minebot_ai_NativeNode_startNode(JNIEnv *env, jobject, jstring working_directory, jobjectArray arguments) {
    if (working_directory == nullptr || arguments == nullptr) return 2;

    const char *directory_chars = env->GetStringUTFChars(working_directory, nullptr);
    if (directory_chars == nullptr) return 2;
    std::string directory(directory_chars);
    env->ReleaseStringUTFChars(working_directory, directory_chars);
    if (directory.empty() || chdir(directory.c_str()) != 0) return errno == 0 ? 2 : errno;

    setenv("HOME", directory.c_str(), 1);
    setenv("TMPDIR", directory.c_str(), 1);
    setenv("NODE_NO_WARNINGS", "1", 0);
    setenv("NODE_OPTIONS", "--no-deprecation", 0);

    const jsize count = env->GetArrayLength(arguments);
    if (count < 2 || count > 32) return 2;
    std::vector<std::string> values;
    values.reserve(static_cast<size_t>(count));
    for (jsize i = 0; i < count; ++i) {
        auto value = static_cast<jstring>(env->GetObjectArrayElement(arguments, i));
        if (value == nullptr) return 2;
        const char *chars = env->GetStringUTFChars(value, nullptr);
        if (chars == nullptr) {
            env->DeleteLocalRef(value);
            return 2;
        }
        values.emplace_back(chars);
        env->ReleaseStringUTFChars(value, chars);
        env->DeleteLocalRef(value);
        if (values.back().size() > 4096) return 2;
    }

    std::vector<char *> argv;
    argv.reserve(values.size());
    for (std::string &value : values) argv.push_back(value.data());
    return static_cast<jint>(node::Start(static_cast<int>(argv.size()), argv.data()));
}
