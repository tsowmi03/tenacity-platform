import Head from "@modules/common/components/head";
import Script from "next/script";
import DesignRuntime, { DesignRuntimePage } from "./DesignRuntime";
import type { DesignStaticProps } from "./staticHtml";

type DesignPageProps = DesignStaticProps & {
  page: DesignRuntimePage;
};

const DesignPage = ({ html, title, description, page }: DesignPageProps) => {
  return (
    <>
      <Head title={title} description={description} />
      {page === "register" ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
        />
      ) : null}
      <DesignRuntime page={page} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
};

export default DesignPage;
