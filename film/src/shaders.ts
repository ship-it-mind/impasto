// The three GPU pieces of the film. Colours are the real Plum Hollow mixes.
const HEAD = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_b;
out vec4 o;
const float PI = 3.14159265;
vec3 lin(vec3 c){ return pow(c,vec3(2.2)); }
vec3 hex(float r,float g,float b){ return vec3(r,g,b)/255.; }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
`

// Thick paint seen from above, raked by a moving light. The opening and closing shots.
export const PAINT = HEAD + `
uniform float u_light, u_dim;
float ridge(vec2 p){
  float s=0., a=.5; vec2 q=p;
  for(int i=0;i<4;i++){ s+=a*abs(sin(q.x*1.7+sin(q.y*1.3+u_b*.03*float(i+1))*1.4)); q=mat2(.8,.6,-.6,.8)*q*2.03+vec2(1.7,9.2); a*=.5; }
  return s;
}
vec2 warp(vec2 p){
  float t=u_b*.05;
  vec2 q=vec2(sin(p.y*.9+t)+sin(p.x*.5-t*.7),cos(p.x*.8-t*.6)+sin(p.y*.4+t*.9));
  return p+q*1.25+vec2(sin(q.y*1.7+t),cos(q.x*1.5-t))*.7;
}
float H(vec2 p){ vec2 w=warp(p); return ridge(w*vec2(1.05,.8))*.95+.6*sin(w.y*2.+w.x*.6); }
vec3 band(float i){
  if(i<1.) return hex(212.,200.,211.);
  if(i<2.) return hex(95.,51.,88.);
  if(i<3.) return hex(150.,71.,120.);
  if(i<4.) return hex(168.,140.,162.);
  return hex(56.,32.,54.);
}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*u_res)/u_res.y;
  vec2 p=uv*2.6+vec2(u_b*.016,-u_b*.01);
  vec2 w=warp(p);
  float e=.0028, h=H(p);
  vec3 n=normalize(vec3(H(p-vec2(e,0.))-H(p+vec2(e,0.)),H(p-vec2(0.,e))-H(p+vec2(0.,e)),e*2.4));
  float f=fract((w.y*.62+w.x*.26+.18*sin(w.x*3.))*.5)*5., i=floor(f), g=smoothstep(.97,1.,fract(f));
  vec3 alb=lin(mix(band(i),band(mod(i+1.,5.)),g));
  alb*=.9+.14*sin(h*7.);
  float ang=u_b*.1+.6;
  vec3 L=normalize(vec3(cos(ang),sin(ang)*.75,.42));
  float dif=max(dot(n,L),0.);
  vec3 hv=normalize(L+vec3(0.,0.,1.));
  float sp=pow(max(dot(n,hv),0.),60.);
  float cav=smoothstep(.2,1.15,h*.8);
  vec3 col=(alb*(.1+dif*2.1)*(.55+.6*cav)+sp*vec3(1.,.95,.9)*.42)*u_light;
  col*=1.-.3*dot(uv,uv);
  col=aces(col)*(1.-u_dim);
  o=vec4(pow(col,vec3(1./2.2)),1.);
}`

// Five real volumes: white paste below, the mixed colour above. Heights are the recipe's kilograms.
export const STACKS = HEAD + `
uniform vec3 u_ro, u_ta;
uniform vec4 u_paint0, u_paste0;   // first 4 bands
uniform float u_paint4, u_paste4;
uniform vec4 u_grow0; uniform float u_grow4;
vec3 C[5];
float box(vec3 p, vec3 b, float r){ vec3 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r; }
float heightP(int i){ return i<4?u_paste0[i]:u_paste4; }
float heightC(int i){ return i<4?u_paint0[i]:u_paint4; }
float gr(int i){ return i<4?u_grow0[i]:u_grow4; }
float map(vec3 p, out float m){
  float d=p.y; m=-1.;
  for(int i=0;i<5;i++){
    float g=gr(i);
    if(g<=.001) continue;
    float x=(float(i)-2.)*2.5;
    float hp=heightP(i)*g, hc=heightC(i)*g;
    float a=box(p-vec3(x,hp*.5,0.),vec3(1.0,hp*.5,1.0),.05);
    if(a<d){ d=a; m=10.; }
    float b=box(p-vec3(x,hp+.03+hc*.5,0.),vec3(1.0,hc*.5,1.0),.05);
    if(b<d){ d=b; m=float(i); }
  }
  return d;
}
float mapD(vec3 p){ float m; return map(p,m); }
vec3 norm(vec3 p){ vec2 e=vec2(.0015,0.); return normalize(vec3(mapD(p+e.xyy)-mapD(p-e.xyy),mapD(p+e.yxy)-mapD(p-e.yxy),mapD(p+e.yyx)-mapD(p-e.yyx))); }
float shadow(vec3 ro, vec3 rd){ float r=1.,t=.03; for(int i=0;i<30;i++){ float h=mapD(ro+rd*t); r=min(r,9.*h/t); t+=clamp(h,.02,.5); if(r<.002||t>16.) break; } return smoothstep(0.,1.,clamp(r,0.,1.)); }
vec3 env(vec3 r){ float y=r.y*.5+.5; return mix(vec3(.018,.014,.013),vec3(.09,.07,.065),y)+vec3(1.,.93,.84)*smoothstep(.45,.8,r.y)*1.3; }
vec3 shade(vec3 p, vec3 n, vec3 rd, float m){
  vec3 L=normalize(vec3(.5,.85,.5));
  float dif=max(dot(n,L),0.), sh=shadow(p+n*.01,L);
  float fre=pow(1.-max(dot(n,-rd),0.),5.);
  vec3 r=reflect(rd,n);
  if(m<-.5) return vec3(.02,.017,.016)*(dif*sh*2.+.3);
  vec3 alb=m>9.?vec3(.86,.84,.8):lin(C[int(m)]);
  vec3 h=normalize(L-rd);
  float sp=pow(max(dot(n,h),0.),50.)*sh;
  return alb*(dif*sh*vec3(1.1,1.05,1.)*1.25+vec3(.3,.3,.32))+sp*.25+env(r)*(.03+fre*.5);
}
void main(){
  C[0]=hex(212.,200.,211.); C[1]=hex(95.,51.,88.); C[2]=hex(150.,71.,120.); C[3]=hex(168.,140.,162.); C[4]=hex(56.,32.,54.);
  vec2 uv=(gl_FragCoord.xy-.5*u_res)/u_res.y;
  vec3 ww=normalize(u_ta-u_ro), uu=normalize(cross(ww,vec3(0.,1.,0.))), vv=cross(uu,ww);
  vec3 rd=normalize(uv.x*uu+uv.y*vv+1.7*ww);
  float t=.02, m=-2.; bool hit=false;
  for(int i=0;i<120;i++){ float d=map(u_ro+rd*t,m); if(d<.001*t){ hit=true; break; } t+=d*.95; if(t>50.) break; }
  vec3 col=mix(vec3(.012,.01,.009),vec3(.03,.024,.022),smoothstep(-.1,.5,rd.y));
  if(hit){
    vec3 p=u_ro+rd*t, n=norm(p);
    col=shade(p,n,rd,m);
    if(m<-.5){
      vec3 r=reflect(rd,n); float t2=.03, m2=-2.; bool h2=false;
      for(int i=0;i<60;i++){ float d=map(p+n*.02+r*t2,m2); if(d<.002){ h2=true; break; } t2+=d; if(t2>26.) break; }
      float fr=.05+.6*pow(1.-max(dot(n,-rd),0.),4.);
      if(h2){ vec3 q=p+n*.02+r*t2; col+=shade(q,norm(q),r,m2)*fr; }
    }
    col=mix(col,vec3(.012,.01,.009),1.-exp(-t*t*.0009));
  }
  col=aces(col*1.15*(1.-.3*dot(uv,uv)));
  o=vec4(pow(col,vec3(1./2.2)),1.);
}`

// A bowl from above: the recipe's tubes in their real proportions, worked together until only the mix is left.
export const MIX = HEAD + `
uniform vec3 u_c0,u_c1,u_c2,u_target;
uniform float u_s0,u_s1,u_u;
uniform vec2 u_center;
uniform float u_r;
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5),b=fract(sin(dot(i+vec2(1.,0.),vec2(127.1,311.7)))*43758.5),c=fract(sin(dot(i+vec2(0.,1.),vec2(127.1,311.7)))*43758.5),d=fract(sin(dot(i+vec2(1.,1.),vec2(127.1,311.7)))*43758.5); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*noise(p); p=mat2(.8,.6,-.6,.8)*p*2.02; a*=.5; } return s; }
float field(vec2 p, float u){
  float ang=(1.-length(p)*.55)*u*11.;      // the knife going round
  float c=cos(ang),s=sin(ang);
  vec2 q=mat2(c,-s,s,c)*p;
  q+=vec2(fbm(q*1.6+u*2.),fbm(q*1.6+7.-u*2.))*(.3+u*.5);
  return fbm(q*(1.25+u*3.2));
}
void main(){
  vec2 uv=(gl_FragCoord.xy-u_center)/u_res.y;
  float r=length(uv);
  vec2 p=uv/u_r;
  float u=u_u;
  float v=field(p,u), e=.004;
  float vx=field(p+vec2(e,0.),u), vy=field(p+vec2(0.,e),u);
  // The bands of the field are spent in the recipe's own shares.
  float t0=.5-.2+.4*u_s0, t1=t0+.4*u_s1;
  float soft=.008+u*.09;
  vec3 c=mix(mix(lin(u_c0),lin(u_c1),smoothstep(t0-soft,t0+soft,v)),lin(u_c2),smoothstep(t1-soft,t1+soft,v));
  c=mix(c,lin(u_target),smoothstep(.62,.98,u));
  vec3 n=normalize(vec3((v-vx)/e*.14,(v-vy)/e*.14,1.));
  vec3 L=normalize(vec3(.55,.65,.55));
  float dif=max(dot(n,L),0.), sp=pow(max(dot(n,normalize(L+vec3(0.,0.,1.))),0.),40.);
  vec3 col=c*(.25+dif*1.75)+sp*.22;
  // the bowl itself
  float rim=smoothstep(u_r,u_r-.006,r);
  float lip=smoothstep(u_r+.05,u_r+.044,r);
  vec3 bg=hex(14.,12.,11.); bg=lin(bg);
  vec3 bowl=lin(hex(238.,232.,222.))*(.6+.5*(uv.y/u_r*.5+.5));
  col=mix(mix(bg,bowl,lip),col*(1.-.45*smoothstep(u_r*.72,u_r,r)),rim);
  o=vec4(pow(aces(col),vec3(1./2.2)),1.);
}`
