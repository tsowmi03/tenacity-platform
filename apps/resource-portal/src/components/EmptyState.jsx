import React from "react";
import Icon from "./Icon";

export default function EmptyState({ icon = "info", title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={24} /></div>
      <div className="empty-title">{title}</div>
      {children ? <div>{children}</div> : null}
    </div>
  );
}
