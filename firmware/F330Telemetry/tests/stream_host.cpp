// Host harness for the actual embedded SSE loop. No ESP32 timing claim.
#include <string>
#include <chrono>
#include <thread>
#include <fstream>
#include <sstream>
#include <iostream>
#include <cstring>
#include <cstdint>
using String=std::string;
struct SerialStub { void println(const char *s){std::cerr<<s<<'\n';} } Serial;
static const auto start=std::chrono::steady_clock::now();
uint32_t millis(){return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-start).count();}
void vTaskDelay(unsigned ms){std::this_thread::sleep_for(std::chrono::milliseconds(ms));}
void vTaskDelete(void*){}
#define pdMS_TO_TICKS(x) (x)
#define F330_STREAM_PORT 8781
String buildState(){std::ifstream f("/tmp/f330-cockpit-preview/api/state");std::stringstream s;s<<f.rdbuf();return s.str();}
#include "../TelemetryStream.h"
int main(){streamTask(nullptr);}
