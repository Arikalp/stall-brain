import CTA from "../components/CTA";
import Demo from "../components/Demo";
import FAQ from "../components/FAQ";
import Features from "../components/Features";
import Footer from "../components/Footer";
import Hero from "../components/Hero";
import HowItWorks from "../components/HowItWorks";
import Navbar from "../components/Navbar";
import Pricing from "../components/Pricing";
import Problem from "../components/Problem";
import Stats from "../components/Stats";
import Testimonials from "../components/Testimonials";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0A0A0A] text-white" id="top">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="absolute -top-40 left-1/2 h-[32rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.25),transparent_70%)] blur-3xl" />
        <div className="absolute top-1/3 right-[-10%] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.18),transparent_70%)] blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.18),transparent_70%)] blur-3xl float-slow" />
        <div className="absolute top-[55%] left-[60%] h-[20rem] w-[20rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.2),transparent_70%)] blur-3xl float-slow" />
      </div>
      <div className="relative z-10">
        <Navbar />
        <main>
          <Hero />
          <Stats />
          <Problem />
          <HowItWorks />
          <Features />
          <Demo />
          <Testimonials />
          <Pricing />
          <FAQ />
          <CTA />
        </main>
        <Footer />
      </div>
    </div>
  );
}
