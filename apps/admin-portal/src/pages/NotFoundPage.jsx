import React from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";

export default function NotFoundPage() {
  return (
    <>
      <PageHeader crumbs={[]} title="Page not found" />

      <div className="card">
        <div className="card-body">
          <p className="muted">
            This page does not exist in the admin portal.
          </p>
          <p className="mt-3">
            <Link to="/">Back to the dashboard</Link>
          </p>
        </div>
      </div>
    </>
  );
}
