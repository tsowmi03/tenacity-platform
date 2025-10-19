import Head from "@modules/common/components/head";
import DemoForm from "@modules/home/contact-form";
import FAQ from "@modules/home/faq";
// import FeaturedPrograms from "@modules/home/featuredPrograms";
import Hero from "@modules/home/hero";
import SchoolSystems from "@modules/home/school-systems";
import Testmonials from "@modules/home/testmonials";

export default function Home() {
  return (
    <div className="flex flex-col gap-20  lg:gap-8 ">
      <Head />
      <Hero />
      <SchoolSystems />
      {/* <FeaturedPrograms /> */}
      <Testmonials />
      <FAQ />
      <DemoForm />
    </div>
  );
}
