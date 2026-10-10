"""Synthetic (FICTIONAL) reports. Tables are markdown so the chunker can keep them together."""

P1, P2, P3, P4 = "p1-halden-road", "p2-marlin-bay-pfas", "p3-brightwater-asbestos", "p4-ironbark-gme"

REPORTS = []


def report(rid, project, title, date, version, status, author, sections):
    REPORTS.append(dict(id=rid, project=project, title=title, date=date, version=version, status=status, author=author, sections=sections))


report("report-p1-dsi", P1, "Detailed Site Investigation - Halden Road Former Fuel Depot", "2026-02-20", "v1.0", "Final", "imogen", [
    ("1 Introduction", "This report presents the detailed site investigation (DSI) of the former Halden Road fuel depot for Halden Fuels Pty Ltd (fictional). The site is zoned commercial/industrial and the assessment therefore adopts the commercial/industrial land use scenario (HIL D) from NEPM ASC Schedule B1. The objectives were to characterise soil and groundwater impacts around the former tank farm and the north-east filled area and to recommend whether remediation is needed."),
    ("2 Investigation program", "The field program comprised 26 boreholes, 6 groundwater monitoring wells (MW01-MW06) and targeted test pits. Samples were analysed for total recoverable hydrocarbons (TRH), BTEXN, PAHs and metals by Southern Cross Analytical (fictional laboratory). QA/QC included field duplicates (RPD within 30%) and laboratory blanks, all acceptable."),
    ("3 Results", "Two areas exceed the adopted criteria.\n\n| Location | Analyte | Result | Criterion | Basis |\n|---|---|---|---|---|\n| TP14 (fill, 0.3 m) | Lead | 2,300 mg/kg | 1,500 mg/kg | NEPM ASC Sch B1 HIL D |\n| BH07 (0.5 m) | TRH F2 | 410 mg/kg | adopted HSL (see RAP) | Health screening level, commercial/industrial |\n\nGroundwater at MW01-MW06 did not exceed the adopted groundwater criteria."),
    ("4 Conclusions and recommendations", "Lead in fill at TP14 and hydrocarbons at BH07 exceed the adopted criteria and require remediation or management. A remedial action plan (RAP) should evaluate excavation and off-site disposal against ex-situ treatment. Groundwater should be re-checked after any excavation."),
])

report("report-p1-rap", P1, "Remedial Action Plan - Halden Road Former Fuel Depot", "2026-04-02", "v1.0", "Final", "imogen", [
    ("1 Remediation objective", "The objective is to remove the lead-impacted fill at TP14 and the hydrocarbon-impacted soil at BH07 so that the site is suitable for commercial/industrial use, validated against the same criteria used in the DSI."),
    ("2 Options considered", "| Option | Description | Programme | Indicative cost impact |\n|---|---|---|---|\n| A | Excavate to 3.5 m and dispose off-site | 8 weeks | baseline |\n| B | Ex-situ bioremediation of hydrocarbon soil, off-site disposal of lead fill | 18 weeks | about A$140k lower for hydrocarbon soil |\n\nOption A was selected because it is faster and gives more certain validation."),
    ("3 Validation plan", "Validation comprises 18 samples from excavation bases and walls, analysed for TRH, BTEXN and lead, plus re-sampling of two monitoring wells after backfill. Results are compared with the DSI criteria. Any exceedance requires further excavation or a documented risk-based justification."),
    ("4 Programme and approvals", "Excavation is scheduled to start 18 May 2026 and validation to complete on 28 August 2026. The closure report is due 13 November 2026 and will be submitted to the site auditor. Dewatering controls are required below 2.5 m in the north-east pit."),
])

report("report-p2-r1", P2, "Round 1 Interim Data Report - Marlin Bay Airport Fire Training Area", "2026-04-14", "v1.0", "Final", "marcus", [
    ("1 Scope and methods", "Round 1 sampling covered 40 soil samples, 12 groundwater wells and 8 surface water points under the agreed sampling and analysis quality plan (SAQP). PFAS-free protocols were used. Field blanks and rinsate blanks were collected every 20 samples."),
    ("2 Screening values", "Results are compared with project-adopted screening values for the purposes of this fictional demonstration: 0.07 ug/L for PFOS + PFHxS and 0.56 ug/L for PFOA in groundwater (drinking water basis). These values are illustrative and are not restated from any standard in this knowledge base."),
    ("3 Results", "| Location | Matrix | PFOS + PFHxS | Screening value | Result vs value |\n|---|---|---|---|---|\n| MW04 | Groundwater | 12.4 ug/L | 0.07 ug/L | exceeds |\n| MW07 | Groundwater | 0.21 ug/L | 0.07 ug/L | exceeds |\n| MW10 | Groundwater | 0.03 ug/L | 0.07 ug/L | below |\n| SW02 | Surface water | non-detect | 0.07 ug/L | below |\n\nThe highest soil concentrations are in the top 1 m beneath the former training pad."),
    ("4 QA/QC and next steps", "Surrogate recoveries were 82-110% and field blanks were below the limit of reporting. A second round and off-site surface water sampling to the east are recommended."),
])

report("report-p2-csm", P2, "Conceptual Site Model Update - Marlin Bay Airport", "2026-08-04", "v1.0", "Final", "marcus", [
    ("1 Source", "The source is the former fire training pad, where aqueous film-forming foam was historically used. Soil impact is concentrated in the top 1 m under the pad."),
    ("2 Pathways and receptors", "Infiltration to shallow groundwater, then lateral migration to the east. Off-site surface water is the key receptor and was non-detect for PFOS and PFHxS at all six off-site points in Round 2. There is no currently complete exposure pathway to people. Future groundwater use is a potential pathway."),
    ("3 Trend", "At MW04, PFOS + PFHxS decreased from 12.4 ug/L (Round 1) to 9.8 ug/L (Round 2), a decrease of about 21%. The concentration is still far above the 0.07 ug/L screening value."),
    ("4 Uncertainties", "The extent of the plume east of MW13 is not yet delineated. The regulator may require additional off-site delineation."),
])

report("report-p3-v1", P3, "Asbestos Assessment and Remediation Plan - Brightwater Estate Stage 3 (DRAFT v1)", "2026-04-01", "v0.9", "Draft", "sana", [
    ("1 Introduction", "This draft report presents the asbestos assessment of Brightwater Estate Stage 3, a residential subdivision for Brightwater Homes (fictional). The site end use is residential with garden access, so the residential A screening levels in NEPM ASC Schedule B1 apply."),
    ("2 Results", "Sixty test pits were excavated on a 25 m grid. Bonded ACM was found in 9 of 60 test pits, all in imported fill. The maximum bonded ACM was 0.03% w/w at TP22, exceeding the residential A screening level of 0.01% w/w. Fibrous asbestos and asbestos fines were below the 0.001% w/w screening level (maximum 0.0008% w/w at TP22)."),
    ("3 Remediation approach", "ACM-impacted fill will be removed off-site by a licensed removalist. The estimated volume of fill to be removed is 1,200 m3, based on the test pit logs. Clearance will be by visual inspection and validation sampling by a licensed asbestos assessor."),
    ("4 Programme", "Removal is planned to begin in June 2026 and to be completed in mid-July 2026, with handover to the builder in August 2026."),
])

report("report-p3-v2", P3, "Asbestos Assessment, Removal and Clearance Report - Brightwater Estate Stage 3 (FINAL v2)", "2026-08-03", "v2.0", "Final", "sana", [
    ("1 Introduction", "This final report presents the asbestos assessment, removal and clearance of Brightwater Estate Stage 3, a residential subdivision for Brightwater Homes (fictional). The site end use is residential with garden access, so the residential A screening levels in NEPM ASC Schedule B1 apply."),
    ("2 Results", "Sixty test pits were excavated on a 25 m grid. Bonded ACM was found in 9 of 60 test pits, all in imported fill. The maximum bonded ACM was 0.03% w/w at TP22, exceeding the residential A screening level of 0.01% w/w. Fibrous asbestos and asbestos fines were below the 0.001% w/w screening level (maximum 0.0008% w/w at TP22). Benzo(a)pyrene TEQ at TP12 was 4.6 mg/kg against the residential A HIL of 3 mg/kg."),
    ("3 Remediation and volume", "ACM-impacted fill was removed off-site by Redgum Remediation, a licensed removalist (fictional). The final surveyed volume removed was 1,150 m3. This supersedes the 1,200 m3 estimate in the draft report. An additional ACM pocket near TP31 was found and removed."),
    ("4 Clearance", "A clearance inspection on 24 July 2026 found no visible ACM and validation samples were below screening levels. The clearance certificate was issued on 3 August 2026."),
])

report("report-p4-assmp", P4, "Acid Sulfate Soils Management Plan - Ironbark Industrial Estate", "2026-03-20", "v1.0", "Final", "marcus", [
    ("1 Findings", "Sulfidic material was found at 2 to 4 m in 22 of 30 boreholes. Groundwater is at about 1.8 m. Dewatering for the drainage upgrade will mobilise acidity and metals and requires treatment before discharge."),
    ("2 Treatment approach", "Dewatering discharge will be treated by lime dosing at 1.5 times the stoichiometric rate to meet a discharge pH of 6.5 to 8.5. (This approach was later reversed; see addendum and the 13 May 2026 decision.)"),
    ("3 Table 4 trigger values", "| Parameter | Trigger value |\n|---|---|\n| pH | 6.5 to 8.5 |\n| Dissolved zinc | 0.08 mg/L |\n| Dissolved aluminium | 0.5 mg/L |\n\nThese are project trigger values for this fictional demonstration."),
    ("4 Monitoring", "Quarterly groundwater monitoring is planned for eight rounds at six monitoring wells (MW01-MW06). The contract was later extended to ten rounds."),
])

report("report-p4-r4", P4, "Groundwater Monitoring Round 4 Report - Ironbark Industrial Estate", "2026-07-30", "v1.0", "Final", "marcus", [
    ("1 Summary", "Round 4 monitoring was completed at six wells. Groundwater pH at MW02 has improved to 5.6 but remains below the trigger range of 6.5 to 8.5. Dissolved aluminium at MW05 is elevated."),
    ("2 Results", "| Well | pH | Dissolved zinc (mg/L) | Dissolved aluminium (mg/L) |\n|---|---|---|---|\n| MW02 | 5.6 | 0.09 | 0.4 |\n| MW05 | 6.9 | 0.03 | 1.8 |\n| MW06 | 7.4 | 0.02 | 0.2 |\n\nTrigger values: pH 6.5 to 8.5; zinc 0.08 mg/L; aluminium 0.5 mg/L."),
    ("3 Interpretation", "The aluminium exceedance at MW05 is not explained by the treatment pond discharge. A verification resample confirmed the result (1.7 mg/L). The trend at MW02 suggests slow recovery after the earlier discharge pH excursion on 4 May 2026."),
    ("4 Recommendations", "Continue quarterly monitoring and consider extending to ten rounds to confirm the trend. A contingency plan may be required if aluminium persists."),
])
