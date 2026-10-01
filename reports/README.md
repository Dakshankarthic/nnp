# AEGIS-SAR — Project Reports & Documentation Repository

This directory consolidates all formal engineering reports, research papers, system specifications, architecture documents, and interactive flowcharts for the **AEGIS-SAR Autonomous Air-Ground Disaster Response Platform**.

---

## 📁 Directory Structure

```
reports/
├── project-reports/               # Formal project reports, Word documents, & text logs
│   ├── AEGIS-SAR-Report.docx      # Comprehensive AEGIS-SAR Final Engineering Report
│   ├── Autonomous_Drone_Real_Technology_to_Our_Rescue_Project.docx # Technical rescue drone documentation
│   ├── Drone_System_Specification.docx  # Airframe, sensor suite, & avionics specs
│   ├── Chunking_Analysis.docx     # Terrain chunking & data segmentation breakdown
│   ├── AEGIS_SAR_Project_Status_Report.md # Milestone tracker & component status log
│   ├── aegis_technical_report.txt # Raw technical data log
│   └── aegis_technical_report_utf8.txt # UTF-8 formatted technical data log
│
├── research-papers-and-analysis/  # Academic papers, mathematical models, & simulation bounds
│   ├── NNP_Neural_Network_Pathfinding_Paper.pdf # Neural Network Pathfinding (NNP) paper
│   └── Disaster_Spread_Ranges_and_Drone_Coverage.pdf # Hazard propagation & sweep coverage analysis
│
├── architecture-and-flowcharts/   # Operational architecture diagrams & interactive web tools
│   ├── AEGIS_SAR_Flowchart.jpg    # High-resolution system pipeline diagram
│   ├── AEGIS_SAR_Full_Flowchart_Architecture.md # Comprehensive node-by-node architecture specs
│   ├── flowchart.html             # Standalone interactive flowchart visualization
│   └── technical_approach_flowchart.html # Interactive technical approach & dataflow breakdown
│
└── archive/                       # Original duplicate downloads & historical backup files
    └── AEGIS-SAR-Report (1).docx  # Exact backup copy of initial submission report
```

---

## 📑 Document Catalog & Summaries

### 1. Project Reports (`reports/project-reports/`)

| File | Format | Description |
| :--- | :--- | :--- |
| **`AEGIS-SAR-Report.docx`** | Microsoft Word (.docx) | Primary project report covering disaster scenario, multi-agent coordination, edge AI detection, and SAR mission protocols. |
| **`Autonomous_Drone_Real_Technology_to_Our_Rescue_Project.docx`** | Microsoft Word (.docx) | In-depth engineering rationale for autonomous UAV deployment in high-risk landslide/mudflow environments. |
| **`Drone_System_Specification.docx`** | Microsoft Word (.docx) | Hardware specifications: 220mm racing-grade carbon fiber airframe, brushless rotors, camera module, and flight controller. |
| **`Chunking_Analysis.docx`** | Microsoft Word (.docx) | Spatial partitioning, hierarchical octree grid decomposition, and sensor data chunking. |
| **`AEGIS_SAR_Project_Status_Report.md`** | Markdown (.md) | Detailed verification status across procedural terrain, drone kinematics, sensor fusion, and HUD interfaces. |
| **`aegis_technical_report.txt`** | Plain Text (.txt) | Numerical benchmarks, coordinate frames, waypoint lists, and raw mission parameters. |

---

### 2. Research Papers & Mathematical Analysis (`reports/research-papers-and-analysis/`)

| File | Format | Key Insights |
| :--- | :--- | :--- |
| **`NNP_Neural_Network_Pathfinding_Paper.pdf`** | PDF Document | Neural Network Pathfinding (NNP) methodology for complex obstacle avoidance and real-time trajectory optimization across disrupted terrain. |
| **`Disaster_Spread_Ranges_and_Drone_Coverage.pdf`** | PDF Document | Mathematical models of landslide runout distances, debris flow velocity, sensor footprint geometries, and optimal search pattern intervals. |

---

### 3. Architecture & Operational Flowcharts (`reports/architecture-and-flowcharts/`)

| File | Format | Usage |
| :--- | :--- | :--- |
| **`AEGIS_SAR_Flowchart.jpg`** | JPEG Image | High-resolution schematic diagram detailing the closed-loop pipeline from UAV reconnaissance to Hexapod ground intervention. |
| **`AEGIS_SAR_Full_Flowchart_Architecture.md`** | Markdown (.md) | Full architectural breakdown with ASCII flow diagrams, interface definitions, and state machine transitions. |
| **`flowchart.html`** | Interactive HTML | Web-based dynamic flowchart illustrating mission lifecycle phases (Survey, Detection, Triage, Evacuation). |
| **`technical_approach_flowchart.html`** | Interactive HTML | Interactive UI showcasing data routing between ROS 2 / Nav2 nodes, fused costmaps, and mission control dashboards. |

---

### 4. Archive (`reports/archive/`)
Contains secondary or duplicate files preserved for traceability and audit integrity.
