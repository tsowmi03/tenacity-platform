import React from "react";
import Icon from "./Icon";

export default function StatCard({ label, value, icon, foot }) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        {icon ? <div className="stat-icon"><Icon name={icon} size={16} /></div> : null}
        <span>{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {foot ? <div className="stat-foot">{foot}</div> : null}
    </div>
  );
}
