import Story from "@modules/about/story";
import Team from "@modules/about/team";
import ValuesSection from "@modules/about/values";
import Head from "@modules/common/components/head";
import animation from "../../../public/animation/tes2.json";
import dynamic from "next/dynamic";
const LottiePlayer = dynamic(() => import("lottie-react"), { ssr: false });

export default function index() {
  return (
    <div className="">
      <Head />
      <div className="flex text-center flex-col justify-center items-center align-middle bg-primary-light pt-16 gap-4">
        <h1 className="text-4xl font-bold text-white uppercase">About Us </h1>
        <LottiePlayer
          animationData={animation}
          loop={false}
          autoplay
          className="w-48 md:w-72"
        />
      </div>
      {/* <div className="text-4xl text-primary w-full text-center py-8 md:py-16">
        <h1 className=" lg:text-[4vw] lg:text-6xl text-3xl">
          About Tenacity Tutoring
        </h1>
      </div>
      <div className="flex  justify-center pb-16 px-8">
        <Image
          src="/image/14 of 15.jpg"
          width={600}
          height={500}
          alt=""
          className=" rounded-lg overflow-hidden"
        />
      </div> */}
      <Story />
      <ValuesSection />
      <Team />
    </div>
  );
}
