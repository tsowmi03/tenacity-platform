import React, { Fragment } from "react";
import Icon from "./Icon";

export default function PageHeader({ title, subtitle, crumbs, actions }) {
  return (
    <div className="page-head">
      <div className="page-head-title">
        {crumbs?.length ? (
          <div className="crumbs">
            {crumbs.map((crumb, index) => (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 ? <Icon className="sep" name="chevron-right" size={12} /> : null}
                {crumb.href ? <a href={crumb.href}>{crumb.label}</a> : <span>{crumb.label}</span>}
              </Fragment>
            ))}
          </div>
        ) : null}
        <h1>{title}</h1>
        {subtitle ? <div className="sub">{subtitle}</div> : null}
      </div>
      {actions ? <div className="page-head-actions">{actions}</div> : null}
    </div>
  );
}
