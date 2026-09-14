#include "../CrsfTelemetry.h"
#include <assert.h>
#include <cmath>
#include <vector>
#include <iostream>
static std::vector<uint8_t> frame(uint8_t type,std::vector<uint8_t> p,uint8_t address=0xc8) {
  std::vector<uint8_t> f={address,uint8_t(p.size()+2),type};
  f.insert(f.end(),p.begin(),p.end());f.push_back(crsfCrc8(f.data()+2,f.size()-2));return f;
}
static void feed(CrsfTelemetry &d,const std::vector<uint8_t>& f,uint32_t now=100) {for(auto b:f)d.feed(b,now);}
static bool close(double a,double b) {return std::abs(a-b)<0.01;}
int main() {
  auto battery=frame(8,{0,168,0,123,1,2,3,100});
  CrsfTelemetry d;feed(d,battery);
  assert(d.data.validFrames==1 && close(d.data.voltage,16.8) && close(d.data.current,12.3));
  assert(d.data.consumed==0x010203 && d.data.percent==100);
  for(unsigned split=0;split<=battery.size();++split) {
    CrsfTelemetry x;for(unsigned i=0;i<split;++i)x.feed(battery[i],1);
    for(unsigned i=split;i<battery.size();++i)x.feed(battery[i],11);
    assert(x.data.battery.seen);
  }
  feed(d,frame(0x1e,{0xd8,0xf0,0x27,0x10,0,0}));
  assert(close(d.data.pitch,-57.29578) && close(d.data.roll,57.29578));
  feed(d,frame(9,{0x26,0x93,0xff,0x83})); // -12.5 m, -1.25 m/s
  assert(close(d.data.baroAltitude,-12.5) && close(d.data.verticalSpeed,-1.25));
  feed(d,frame(2,{0xff,0x67,0x69,0x80,0,0x98,0x96,0x80,0,36,0,90,3,0xed,8}));
  assert(close(d.data.latitude,-1) && close(d.data.longitude,1));
  assert(d.data.speed==36 && d.data.course==90 && d.data.gpsAltitude==5 && d.data.satellites==8);
  feed(d,frame(0x21,{'*','8','A','C','R','O',0}));assert(!strcmp(d.data.flightMode,"*8ACRO"));
  feed(d,frame(0x21,std::vector<uint8_t>(60,'A')));assert(strlen(d.data.flightMode)==16);
  for(uint8_t address:{0x00,0xc8,0xea,0xec,0xee}) {CrsfTelemetry x;feed(x,frame(8,{0,168,0,1,0,0,0,100},address));assert(x.data.battery.seen);}
  CrsfTelemetry truncated;feed(truncated,frame(8,{0,168}));assert(!truncated.data.battery.seen && truncated.data.badLengths==1);
  CrsfTelemetry falseLength;falseLength.feed(0xc8,100);falseLength.feed(62,100);
  feed(falseLength,battery,101);
  assert(falseLength.data.battery.seen && falseLength.data.validFrames==1);
  CrsfTelemetry continuous;auto corrupt=battery;corrupt.back()^=0x80;
  feed(continuous,corrupt);feed(continuous,battery,101);
  assert(continuous.data.battery.seen && continuous.data.crcErrors==1);
  CrsfTelemetry damaged;auto bad=battery;bad.back()^=1;feed(damaged,bad);assert(!damaged.data.battery.seen);
  // A damaged length may leave a partial candidate: timeout restores framing.
  damaged.expire(200);feed(damaged,battery,201);assert(damaged.data.battery.seen && damaged.data.crcErrors);
  CrsfTelemetry partial;partial.feed(0xc8,0xfffffff0);partial.feed(62,0xfffffff0);partial.expire(0x30);feed(partial,battery,0x31);assert(partial.data.battery.seen && partial.data.timeouts==1);
  CrsfTelemetry noise;uint32_t rng=7;
  for(int i=0;i<100000;++i){rng=rng*1664525+1013904223;noise.feed(rng>>24,i/100);}
  noise.expire(2000);feed(noise,battery,2001);assert(noise.data.battery.seen);
  assert(usToCrsf(800)==172 && usToCrsf(1000)==192 && usToCrsf(1500)==992 && usToCrsf(2000)==1792);
  uint16_t us[16];for(int i=0;i<16;++i)us[i]=1000+i*60;
  uint8_t packed[22];packCrsfChannels(us,packed);
  for(int ch=0;ch<16;++ch){unsigned value=0;for(int bit=0;bit<11;++bit){int offset=11*ch+bit;value|=((packed[offset/8]>>(offset%8))&1)<<bit;}assert(value==usToCrsf(us[ch]));}
  std::cout<<"Telemetry decoding, CRC rejection, framing recovery, bounds, wraparound and RC packing passed.\n";
}
