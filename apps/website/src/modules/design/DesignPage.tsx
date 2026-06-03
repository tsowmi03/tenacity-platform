import Head from "@modules/common/components/head";
import DesignRuntime, { DesignRuntimePage } from "./DesignRuntime";
import type { DesignStaticProps } from "./staticHtml";

type DesignPageProps = DesignStaticProps & {
  page: DesignRuntimePage;
};

const DesignPage = ({ html, title, description, page }: DesignPageProps) => {
  return (
    <>
      <Head title={title} description={description} />
      <DesignRuntime page={page} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
};

export default DesignPage;
