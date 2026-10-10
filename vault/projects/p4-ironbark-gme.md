---
id: p4-ironbark-gme
type: project
title: Ironbark Industrial Estate - Acid Sulfate Soils and Groundwater Monitoring
code: P4
date: '2026-03-06'
client: Ironbark Industrial Estates (fictional)
project_manager: '[[Marcus Oyelaran]]'
status: Groundwater monitoring in progress (round 5 of 10)
budget_aud: 384000
committed_aud: 301000
contaminants:
- acid sulfate soils
- dissolved zinc
- dissolved aluminium
milestones:
- name: ASS investigation complete
  due: '2026-03-06'
  done: '2026-03-06'
- name: Acid sulfate soils management plan issued
  due: '2026-03-20'
  done: '2026-03-20'
- name: Monitoring round 4 report
  due: '2026-07-30'
  done: '2026-07-30'
- name: Monitoring round 5
  due: '2026-10-30'
  done: null
- name: Final monitoring report (round 10)
  due: '2027-06-30'
  done: null
exceedances:
- analyte: pH
  location: MW02 (groundwater, round 3)
  result: 4.2
  unit: pH units
  criterion: 6.5
  basis: ASSMP Table 4 trigger range 6.5-8.5
  status: Monitoring
- analyte: Dissolved zinc
  location: MW02 (groundwater, round 3)
  result: 0.19
  unit: mg/L
  criterion: 0.08
  basis: ASSMP Table 4 project trigger value
  status: Monitoring
- analyte: Dissolved aluminium
  location: MW05 (groundwater, round 4)
  result: 1.8
  unit: mg/L
  criterion: 0.5
  basis: ASSMP Table 4 project trigger value
  status: Persistent
decisions:
- date: '2026-03-20'
  text: Approved lime dosing at 1.5 x stoichiometric rate for treatment of dewatering discharge.
  by: Imogen Hartley
- date: '2026-05-13'
  text: 'REVERSED the lime dosing decision: switch to crushed limestone after lime caused overdosing (pond pH 10.8) and pump blockages.'
  by: Imogen Hartley
- date: '2026-09-29'
  text: Extended monitoring from 8 to 10 rounds (+A$24,000).
  by: Leila Fontaine
risks:
- text: Persistent aluminium exceedances at MW05 may trigger a regulator request for a contingency plan.
  level: medium
facts:
  monitoring_rounds_planned: 10
  monitoring_rounds_done: 4
  extension_aud: 24000
fictional: true
tags:
- acid-sulfate-soils
- groundwater
- industrial
- monitoring
- project
---

# Ironbark Industrial Estate - Acid Sulfate Soils and Groundwater Monitoring

**Client:** Ironbark Industrial Estates (fictional)  
**Project manager:** [[Marcus Oyelaran]]  
**Status:** Groundwater monitoring in progress (round 5 of 10)  
**Budget:** A$384,000; committed A$301,000

## Milestones

| Milestone | Due | Completed | Note |
|---|---|---|---|
| ASS investigation complete | 2026-03-06 | 2026-03-06 |  |
| Acid sulfate soils management plan issued | 2026-03-20 | 2026-03-20 |  |
| Monitoring round 4 report | 2026-07-30 | 2026-07-30 |  |
| Monitoring round 5 | 2026-10-30 | open |  |
| Final monitoring report (round 10) | 2027-06-30 | open |  |

## Exceedances

| Analyte | Location | Result | Criterion | Basis | Status |
|---|---|---|---|---|---|
| pH | MW02 (groundwater, round 3) | 4.2 pH units | 6.5 pH units | ASSMP Table 4 trigger range 6.5-8.5 | Monitoring |
| Dissolved zinc | MW02 (groundwater, round 3) | 0.19 mg/L | 0.08 mg/L | ASSMP Table 4 project trigger value | Monitoring |
| Dissolved aluminium | MW05 (groundwater, round 4) | 1.8 mg/L | 0.5 mg/L | ASSMP Table 4 project trigger value | Persistent |

## Decisions

- 2026-03-20: Approved lime dosing at 1.5 x stoichiometric rate for treatment of dewatering discharge. (approved by [[Imogen Hartley]])
- 2026-05-13: REVERSED the lime dosing decision: switch to crushed limestone after lime caused overdosing (pond pH 10.8) and pump blockages. (approved by [[Imogen Hartley]])
- 2026-09-29: Extended monitoring from 8 to 10 rounds (+A$24,000). (approved by [[Leila Fontaine]])

## Risks

- (medium) Persistent aluminium exceedances at MW05 may trigger a regulator request for a contingency plan.

## Records

- Report: [[report-p4-assmp]]
- Report: [[report-p4-r4]]
