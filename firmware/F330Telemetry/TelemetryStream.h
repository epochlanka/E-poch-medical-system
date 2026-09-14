#pragma once
// Persistent SSE on port 81: up to three clients, 20 Hz latest snapshots.
// Nonblocking socket IO; partial writes are retained and slow clients dropped.
// Separate Core 0 task prevents a slow HTTP page request delaying the stream.
#include <lwip/sockets.h>
#include <fcntl.h>
#include <errno.h>
#include <netinet/tcp.h>

#ifndef F330_STREAM_PORT
#define F330_STREAM_PORT 81
#endif

struct StreamClient {
  int fd=-1;
  bool ready=false;
  char request[768]={};
  size_t requestSize=0, sent=0;
  uint32_t progress=0;
  String pending;
};
void closeStream(StreamClient &c) {
  if (c.fd>=0) close(c.fd);
  c.fd=-1; c.ready=false; c.requestSize=0; c.sent=0; c.pending="";
}
void streamTask(void *) {
  int listener=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);
  if (listener<0) { vTaskDelete(nullptr); return; }
  int yes=1;
  setsockopt(listener,SOL_SOCKET,SO_REUSEADDR,&yes,sizeof(yes));
  sockaddr_in address={}; address.sin_family=AF_INET;
  address.sin_port=htons(F330_STREAM_PORT); address.sin_addr.s_addr=htonl(INADDR_ANY);
  if (bind(listener,reinterpret_cast<sockaddr*>(&address),sizeof(address))<0 || listen(listener,3)<0 ||
      fcntl(listener,F_SETFL,O_NONBLOCK)<0) {
    Serial.println("Telemetry stream failed; HTTP fallback available.");
    close(listener); vTaskDelete(nullptr); return;
  }
  StreamClient clients[3];
  uint32_t published=0;
  for (;;) {
    uint32_t now=millis();
    int fd=accept(listener,nullptr,nullptr);
    if (fd>=0) {
      bool accepted=false;
      for (auto &c:clients) if (c.fd<0) {
        if (fcntl(fd,F_SETFL,O_NONBLOCK)<0) break;
        setsockopt(fd,IPPROTO_TCP,TCP_NODELAY,&yes,sizeof(yes));
        c.fd=fd; c.progress=now; accepted=true; break;
      }
      if (!accepted) close(fd);
    }
    for (auto &c:clients) {
      if (c.fd<0) continue;
      if (!c.ready) {
        int n=recv(c.fd,c.request+c.requestSize,sizeof(c.request)-1-c.requestSize,MSG_DONTWAIT);
        if (n>0) {
          c.requestSize+=n; c.request[c.requestSize]=0;
          if (strstr(c.request,"\r\n\r\n")) {
            if (strncmp(c.request,"GET /events HTTP/1.",19)!=0) { closeStream(c); continue; }
            c.ready=true; c.progress=now;
            c.pending="HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\nretry: 1000\n\n";
          }
        } else if (n==0 || (errno!=EAGAIN && errno!=EWOULDBLOCK)) { closeStream(c); continue; }
        if (!c.ready && (c.requestSize>=sizeof(c.request)-1 || now-c.progress>1500)) {closeStream(c);continue;}
      }
      if (c.ready && c.pending.length()) {
        int n=send(c.fd,c.pending.c_str()+c.sent,c.pending.length()-c.sent,MSG_DONTWAIT);
        if (n>0) {
          c.sent+=n; c.progress=now;
          if (c.sent==c.pending.length()) {c.pending="";c.sent=0;}
        } else if (n==0 || (errno!=EAGAIN && errno!=EWOULDBLOCK)) {closeStream(c);continue;}
        if (c.pending.length() && now-c.progress>1000) closeStream(c);
      }
    }
    if (now-published>=50) {
      published=now;
      bool wanted=false;
      for (const auto &c:clients) if(c.fd>=0 && c.ready && !c.pending.length()) wanted=true;
      if (wanted) {
        String json=buildState();
        if (json.length()) for (auto &c:clients) if(c.fd>=0 && c.ready && !c.pending.length()) {
          c.pending="data: "+json+"\n\n"; c.sent=0; c.progress=now;
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}
