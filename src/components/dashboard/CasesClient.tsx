"use client";

import React, { useState } from "react";
import styles from "./cases.module.css";

type CaseStatus = "active" | "closed";

type Case = {
  id: string;
  title: string;
  reference: string;
  status: CaseStatus;
  date: string;
  parties: string;
  caseType: string;
};

const sampleCases: Case[] = [
  {
    id: "1",
    title: "Smith vs. Property Management Ltd",
    reference: "REF-2023-001",
    status: "active",
    date: "15 Nov 2023",
    parties: "Tenant: John Smith | Landlord: Property Management Ltd",
    caseType: "Housing Disrepair"
  },
  {
    id: "2",
    title: "Brown Housing Dispute",
    reference: "REF-2023-002",
    status: "active",
    date: "10 Nov 2023",
    parties: "Tenant: Sarah Brown | Landlord: City Housing Association",
    caseType: "Tenant Rights"
  },
  {
    id: "3",
    title: "Johnson Property Case",
    reference: "REF-2023-003",
    status: "closed",
    date: "5 Oct 2023",
    parties: "Tenant: Michael Johnson | Landlord: Urban Properties",
    caseType: "Lease Dispute"
  }
];

export default function CasesClient() {
  const [cases] = useState<Case[]>(sampleCases);
  const [activeSectionCollapsed, setActiveSectionCollapsed] = useState(false);
  const [closedSectionCollapsed, setClosedSectionCollapsed] = useState(true);

  const activeCases = cases.filter((c) => c.status === "active");
  const closedCases = cases.filter((c) => c.status === "closed");

  const handleAccept = (caseId: string) => {
    console.log("Accepting case:", caseId);
    // Add logic here
  };

  const handleCopy = (caseId: string) => {
    console.log("Copying case:", caseId);
    // Add logic here
  };

  const handleDecline = (caseId: string) => {
    console.log("Declining case:", caseId);
    // Add logic here
  };

  return (
    <div className={styles.theme}>
      <div style={{ margin: "0 20px 50px 20px" }}>
      {/* Stats Summary */}
      <div className={styles.statsSummary}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{cases.length}</div>
          <div className={styles.statLabel}>Total Cases</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{activeCases.length}</div>
          <div className={styles.statLabel}>Active Cases</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{closedCases.length}</div>
          <div className={styles.statLabel}>Closed Cases</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {cases.length > 0 ? cases[0].date : "—"}
          </div>
          <div className={styles.statLabel}>Last Updated</div>
        </div>
      </div>

      {/* Active Cases Section */}
      <div className={`${styles.casesSection} ${activeSectionCollapsed ? styles.collapsed : ""}`}>
        <div
          className={styles.sectionHeader}
          onClick={() => setActiveSectionCollapsed(!activeSectionCollapsed)}
        >
          <h2>
            <i className="bx bxs-folder-open" />
            Active Cases
          </h2>
          <div className={styles.sectionControls}>
            <span className={styles.caseCount}>{activeCases.length}</span>
            <i className={`bx bx-chevron-down ${styles.sectionToggle}`} />
          </div>
        </div>

        {!activeSectionCollapsed && (
          <div className={styles.casesGrid}>
            {activeCases.length === 0 ? (
              <div className={styles.noCases}>
                <i className={`bx bx-folder-open ${styles.noCasesIcon}`} />
                <h3>No Active Cases</h3>
                <p>You don&apos;t have any active cases at the moment.</p>
              </div>
            ) : (
              activeCases.map((caseItem) => (
                <div key={caseItem.id} className={`${styles.caseCard} ${styles.caseCardActive}`}>
                  <div className={styles.caseHeader}>
                    <div className={styles.caseNumber}>
                      <i className="bx bxs-file" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3>{caseItem.title}</h3>
                      <p className={styles.caseRef}>{caseItem.reference}</p>
                    </div>
                  </div>

                  <div className={styles.caseMeta}>
                    <span className={`${styles.caseType} ${styles.caseTypeActive}`}>
                      {caseItem.status}
                    </span>
                    <span className={styles.caseDate}>
                      <i className="bx bx-calendar" /> {caseItem.date}
                    </span>
                  </div>

                  <div className={styles.caseDetails}>
                    <p>
                      <strong>Parties:</strong> {caseItem.parties}
                    </p>
                    <p>
                      <strong>Case Type:</strong> {caseItem.caseType}
                    </p>
                  </div>

                  <div className={styles.caseActions}>
                    <button
                      className={styles.acceptBtn}
                      onClick={() => handleAccept(caseItem.id)}
                    >
                      <i className="bx bx-check" /> View Details
                    </button>
                    <button
                      className={styles.copyBtn}
                      onClick={() => handleCopy(caseItem.id)}
                    >
                      <i className="bx bx-copy" /> Copy
                    </button>
                    <button
                      className={styles.declineBtn}
                      onClick={() => handleDecline(caseItem.id)}
                    >
                      <i className="bx bx-x" /> Close
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Closed Cases Section */}
      <div className={`${styles.casesSection} ${closedSectionCollapsed ? styles.collapsed : ""}`}>
        <div
          className={styles.sectionHeader}
          onClick={() => setClosedSectionCollapsed(!closedSectionCollapsed)}
        >
          <h2>
            <i className="bx bxs-folder" />
            Closed Cases
          </h2>
          <div className={styles.sectionControls}>
            <span className={styles.caseCount}>{closedCases.length}</span>
            <i className={`bx bx-chevron-down ${styles.sectionToggle}`} />
          </div>
        </div>

        {!closedSectionCollapsed && (
          <div className={styles.casesGrid}>
            {closedCases.length === 0 ? (
              <div className={styles.noCases}>
                <i className={`bx bx-folder ${styles.noCasesIcon}`} />
                <h3>No Closed Cases</h3>
                <p>You don&apos;t have any closed cases.</p>
              </div>
            ) : (
              closedCases.map((caseItem) => (
                <div key={caseItem.id} className={`${styles.caseCard} ${styles.caseCardClosed}`}>
                  <div className={styles.caseHeader}>
                    <div className={styles.caseNumber}>
                      <i className="bx bxs-file" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3>{caseItem.title}</h3>
                      <p className={styles.caseRef}>{caseItem.reference}</p>
                    </div>
                  </div>

                  <div className={styles.caseMeta}>
                    <span className={`${styles.caseType} ${styles.caseTypeClosed}`}>
                      {caseItem.status}
                    </span>
                    <span className={styles.caseDate}>
                      <i className="bx bx-calendar" /> {caseItem.date}
                    </span>
                  </div>

                  <div className={styles.caseDetails}>
                    <p>
                      <strong>Parties:</strong> {caseItem.parties}
                    </p>
                    <p>
                      <strong>Case Type:</strong> {caseItem.caseType}
                    </p>
                  </div>

                  <div className={styles.caseActions}>
                    <button
                      className={styles.acceptBtn}
                      onClick={() => handleAccept(caseItem.id)}
                    >
                      <i className="bx bx-show" /> View Archive
                    </button>
                    <button
                      className={styles.copyBtn}
                      onClick={() => handleCopy(caseItem.id)}
                    >
                      <i className="bx bx-copy" /> Copy
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Floating Talk Button */}
      <div className={styles.talkBtnContainer}>
        <a href="/chatbot?new=true" className={styles.talkBtn}>
          <i className="bx bx-message-dots" />
          Talk to AI
        </a>
      </div>
      </div>
    </div>
  );
}
