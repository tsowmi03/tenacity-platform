import DesignPage from "@modules/design/DesignPage";
import { getDesignStaticProps } from "@modules/design/staticHtml";
import type { DesignStaticProps } from "@modules/design/staticHtml";

export const getStaticProps = () => {
  return {
    props: getDesignStaticProps("contact.html"),
  };
};

export default function Contact(props: DesignStaticProps) {
  return <DesignPage {...props} page="contact" />;
}
