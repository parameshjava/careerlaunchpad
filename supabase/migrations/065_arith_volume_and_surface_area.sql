-- ============================================================================
-- 065_arith_volume_and_surface_area.sql
-- Question-bank seed: Arithmetic chapter "Volume and Surface Area" -- 38 single-answer MCQs
-- from ACTUAL previous-year papers / standard aptitude texts (bank PO/Clerk, SSC,
-- ICET, IT placement). Exam-grade floor; answers independently recomputed & each
-- correct option verified; 4 distinct-valued options, one correct; each carries a
-- worked explanation. Depends on 023. Reuses idempotent _seed_arith_q. Safe to re-run.
-- Cube/cuboid/cylinder/sphere/cone/hemisphere volume & surface area, recast, frustum, ratios.
-- ============================================================================

create or replace function public._seed_arith_q(p_chapter text, p_difficulty text, p_stem text, p_opts text[], p_correct int, p_explanation text) returns void language plpgsql as $$
declare v_subj uuid; v_chap uuid; v_qid uuid; i int;
begin
  select id into v_subj from public.subject where lower(name)='arithmetic' limit 1;
  if v_subj is null then raise exception 'Arithmetic subject not found (run 023 first)'; end if;
  select id into v_chap from public.chapter where subject_id=v_subj and lower(name)=lower(p_chapter) limit 1;
  if v_chap is null then raise exception 'Chapter % not found', p_chapter; end if;
  if exists (select 1 from public.question where chapter_id=v_chap and stem=p_stem) then return; end if;
  insert into public.question (subject_id, chapter_id, kind, difficulty, answer_type, stem, explanation)
  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem, p_explanation) returning id into v_qid;
  for i in 1..array_length(p_opts,1) loop
    insert into public.question_option (question_id, label, is_correct, position) values (v_qid, p_opts[i], i=p_correct, i-1);
  end loop;
end; $$;

-- Volume and Surface Area (38 questions)
select public._seed_arith_q($q$Volume and Surface Area$q$,'easy',$q$Find the volume of a cube whose edge is 6 cm.$q$,array[$q$180 cm³$q$,$q$216 cm³$q$,$q$240 cm³$q$,$q$196 cm³$q$],2,$q$V = a³ = 6³ = 216 cm³.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'easy',$q$A cuboid measures 8 cm × 6 cm × 5 cm. Find its volume.$q$,array[$q$240 cm³$q$,$q$180 cm³$q$,$q$210 cm³$q$,$q$300 cm³$q$],1,$q$V = l·b·h = 8·6·5 = 240 cm³.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'easy',$q$Find the volume of a cylinder of radius 7 cm and height 10 cm. (π = 22/7)$q$,array[$q$1320 cm³$q$,$q$1470 cm³$q$,$q$1540 cm³$q$,$q$1760 cm³$q$],3,$q$V = πr²h = (22/7)(49)(10) = 1540 cm³.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'easy',$q$Find the volume of a sphere of diameter 21 cm. (π = 22/7)$q$,array[$q$4851 cm³$q$,$q$5324 cm³$q$,$q$4410 cm³$q$,$q$3234 cm³$q$],1,$q$r = 10.5; V = (4/3)πr³ = (4/3)(22/7)(10.5)³ = 4851 cm³.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'easy',$q$Find the volume of a cone of base radius 3 cm and height 7 cm. (π = 22/7)$q$,array[$q$44 cm³$q$,$q$88 cm³$q$,$q$66 cm³$q$,$q$99 cm³$q$],3,$q$V = (1/3)πr²h = (1/3)(22/7)(9)(7) = 66 cm³.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'easy',$q$Find the total surface area of a cube of edge 5 cm.$q$,array[$q$125 cm²$q$,$q$150 cm²$q$,$q$100 cm²$q$,$q$180 cm²$q$],2,$q$TSA = 6a² = 6(25) = 150 cm².$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'easy',$q$Find the total surface area of a cuboid 10 cm × 8 cm × 6 cm.$q$,array[$q$376 cm²$q$,$q$480 cm²$q$,$q$236 cm²$q$,$q$344 cm²$q$],1,$q$TSA = 2(lb+bh+hl) = 2(80+48+60) = 376 cm².$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'easy',$q$Find the total surface area of a cylinder of radius 7 cm and height 15 cm. (π = 22/7)$q$,array[$q$660 cm²$q$,$q$968 cm²$q$,$q$880 cm²$q$,$q$1078 cm²$q$],2,$q$TSA = 2πr(h+r) = 2(22/7)(7)(22) = 968 cm².$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'easy',$q$Find the surface area of a sphere of radius 7 cm. (π = 22/7)$q$,array[$q$308 cm²$q$,$q$462 cm²$q$,$q$616 cm²$q$,$q$704 cm²$q$],3,$q$SA = 4πr² = 4(22/7)(49) = 616 cm².$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'easy',$q$Find the curved surface area of a cone of radius 7 cm and slant height 25 cm. (π = 22/7)$q$,array[$q$550 cm²$q$,$q$770 cm²$q$,$q$440 cm²$q$,$q$616 cm²$q$],1,$q$CSA = πrl = (22/7)(7)(25) = 550 cm².$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'medium',$q$A cylinder of base radius 7 cm has a volume of 770 cm³. Find its height. (π = 22/7)$q$,array[$q$4 cm$q$,$q$6 cm$q$,$q$5 cm$q$,$q$7 cm$q$],3,$q$h = V/(πr²) = 770/((22/7)(49)) = 5 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'medium',$q$The volume of a cube is 2744 cm³. Find the length of its edge.$q$,array[$q$12 cm$q$,$q$14 cm$q$,$q$16 cm$q$,$q$13 cm$q$],2,$q$a = ∛2744 = 14 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'medium',$q$A cone of height 24 cm has a volume of 1232 cm³. Find its base radius. (π = 22/7)$q$,array[$q$7 cm$q$,$q$14 cm$q$,$q$5 cm$q$,$q$10 cm$q$],1,$q$r² = 3V/(πh) = 3(1232)/((22/7)(24)) = 49 ⇒ r = 7 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'medium',$q$Find the curved (lateral) surface area of a cylinder of radius 14 cm and height 20 cm. (π = 22/7)$q$,array[$q$1540 cm²$q$,$q$1760 cm²$q$,$q$2992 cm²$q$,$q$2464 cm²$q$],2,$q$CSA = 2πrh = 2(22/7)(14)(20) = 1760 cm².$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'medium',$q$The cost of painting all faces of a cube of edge 10 cm at ₹5 per cm² is:$q$,array[$q$₹2400$q$,$q$₹3000$q$,$q$₹1500$q$,$q$₹6000$q$],2,$q$TSA = 6(10²) = 600 cm²; cost = 600×5 = ₹3000.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'medium',$q$A room is 10 m long, 7 m broad and 5 m high. Find the cost of plastering its four walls and ceiling at ₹5 per m².$q$,array[$q$₹1000$q$,$q$₹1200$q$,$q$₹1400$q$,$q$₹950$q$],2,$q$Area = 2h(l+b)+lb = 2·5·17 + 70 = 170+70 = 240 m²; cost = 240×5 = ₹1200.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'medium',$q$A rectangular water tank is 6 m × 4 m × 3 m. How many litres of water can it hold? (1 m³ = 1000 L)$q$,array[$q$48000 L$q$,$q$60000 L$q$,$q$72000 L$q$,$q$36000 L$q$],3,$q$V = 6·4·3 = 72 m³ = 72×1000 = 72000 L.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'medium',$q$A cylinder of height 10 cm has a volume of 1540 cm³. Find its diameter. (π = 22/7)$q$,array[$q$7 cm$q$,$q$10 cm$q$,$q$14 cm$q$,$q$21 cm$q$],3,$q$r² = V/(πh) = 1540/((22/7)(10)) = 49 ⇒ r = 7, diameter = 14 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'medium',$q$The surface area of a sphere is 616 cm². Find its radius. (π = 22/7)$q$,array[$q$7 cm$q$,$q$14 cm$q$,$q$10.5 cm$q$,$q$3.5 cm$q$],1,$q$r² = SA/(4π) = 616/((4)(22/7)) = 49 ⇒ r = 7 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'medium',$q$Find the slant height of a cone whose base radius is 7 cm and height is 24 cm.$q$,array[$q$23 cm$q$,$q$25 cm$q$,$q$26 cm$q$,$q$31 cm$q$],2,$q$l = √(r²+h²) = √(49+576) = √625 = 25 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'hard',$q$A solid sphere of radius 6 cm is melted and recast into a cylinder of radius 4 cm. Find the height of the cylinder.$q$,array[$q$12 cm$q$,$q$16 cm$q$,$q$18 cm$q$,$q$24 cm$q$],3,$q$(4/3)π·6³ = π·4²·h ⇒ h = (4/3)(216)/16 = 18 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'hard',$q$Three metal cubes of edges 3 cm, 4 cm and 5 cm are melted into a single cube. Find the edge of the new cube.$q$,array[$q$6 cm$q$,$q$7 cm$q$,$q$8 cm$q$,$q$9 cm$q$],1,$q$Vol = 27+64+125 = 216 ⇒ edge = ∛216 = 6 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'hard',$q$Two spheres have radii in the ratio 2:3. Find the ratio of their volumes.$q$,array[$q$4:9$q$,$q$2:3$q$,$q$8:27$q$,$q$6:9$q$],3,$q$Volume ∝ r³ ⇒ (2:3)³ = 8:27.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'hard',$q$Find the volume of a hemisphere of radius 7 cm. (π = 22/7)$q$,array[$q$718.67 cm³$q$,$q$1437.33 cm³$q$,$q$539 cm³$q$,$q$462 cm³$q$],1,$q$V = (2/3)πr³ = (2/3)(22/7)(343) = 718.67 cm³.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'hard',$q$Find the total surface area of a hemisphere of radius 7 cm. (π = 22/7)$q$,array[$q$308 cm²$q$,$q$616 cm²$q$,$q$462 cm²$q$,$q$539 cm²$q$],3,$q$TSA = 3πr² = 3(22/7)(49) = 462 cm².$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'hard',$q$A toy is a cone of radius 3 cm and height 4 cm surmounted on a hemisphere of radius 3 cm. Find its total volume. (in terms of π)$q$,array[$q$30π cm³$q$,$q$24π cm³$q$,$q$36π cm³$q$,$q$18π cm³$q$],1,$q$Cone = (1/3)π·9·4 = 12π; hemisphere = (2/3)π·27 = 18π; total = 30π cm³.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'hard',$q$Find the length of the diagonal of a cuboid of dimensions 3 cm × 4 cm × 12 cm.$q$,array[$q$12 cm$q$,$q$13 cm$q$,$q$14 cm$q$,$q$15 cm$q$],2,$q$d = √(3²+4²+12²) = √(9+16+144) = √169 = 13 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'hard',$q$Find the volume of the largest sphere that can be carved out of a cube of edge 14 cm. (π = 22/7)$q$,array[$q$1437.33 cm³$q$,$q$2744 cm³$q$,$q$4851 cm³$q$,$q$718.67 cm³$q$],1,$q$Sphere radius = 14/2 = 7; V = (4/3)(22/7)(343) = 1437.33 cm³.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'hard',$q$A cone of radius 6 cm and height 24 cm is melted and recast into a cylinder of radius 6 cm. Find the height of the cylinder.$q$,array[$q$6 cm$q$,$q$12 cm$q$,$q$8 cm$q$,$q$24 cm$q$],3,$q$(1/3)π·6²·24 = π·6²·h ⇒ h = 24/3 = 8 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'very_hard',$q$A solid sphere of radius 6 cm is melted into small spheres each of radius 1 cm. How many small spheres are formed?$q$,array[$q$36$q$,$q$72$q$,$q$216$q$,$q$144$q$],3,$q$n = R³/r³ = 6³/1³ = 216.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'very_hard',$q$Find the volume of a frustum of a cone with radii 6 cm and 3 cm and height 7 cm. (π = 22/7)$q$,array[$q$396 cm²$q$,$q$462 cm³$q$,$q$528 cm³$q$,$q$330 cm³$q$],2,$q$V = (1/3)πh(R²+r²+Rr) = (1/3)(22/7)(7)(36+9+18) = (22/3)(63) = 462 cm³.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'very_hard',$q$If the radius of a cylinder is doubled and its height is halved, the percentage change in its volume is:$q$,array[$q$No change$q$,$q$50% increase$q$,$q$100% increase$q$,$q$200% increase$q$],3,$q$New/old = (2²)(1/2) = 2 ⇒ volume becomes 2× ⇒ 100% increase.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'very_hard',$q$A cone, a hemisphere and a cylinder stand on equal bases and have the same height (equal to the radius). Find the ratio of their volumes.$q$,array[$q$1:2:3$q$,$q$3:2:1$q$,$q$1:3:2$q$,$q$2:1:3$q$],1,$q$With h = r: cone (1/3)πr³ : hemisphere (2/3)πr³ : cylinder πr³ = 1:2:3.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'very_hard',$q$A metallic sphere of radius 6 cm is dropped into a cylindrical vessel of radius 12 cm partly filled with water. By how much does the water level rise?$q$,array[$q$1 cm$q$,$q$2 cm$q$,$q$3 cm$q$,$q$4 cm$q$],2,$q$(4/3)π·6³ = π·12²·h ⇒ h = (4/3)(216)/144 = 2 cm.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'very_hard',$q$A sphere of radius 6 cm is melted and recast into small cones each of radius 2 cm and height 3 cm. How many cones are formed?$q$,array[$q$48$q$,$q$64$q$,$q$72$q$,$q$96$q$],3,$q$n = [(4/3)π·6³] / [(1/3)π·2²·3] = 288π / 4π = 72.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'very_hard',$q$Find the curved surface area of a frustum with radii 6 cm and 3 cm and vertical height 4 cm. (π = 22/7)$q$,array[$q$141.43 cm²$q$,$q$282.86 cm²$q$,$q$198 cm²$q$,$q$99 cm²$q$],1,$q$Slant l = √((6−3)²+4²) = 5; CSA = π(R+r)l = (22/7)(9)(5) = 141.43 cm².$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'very_hard',$q$If the radius of a sphere is increased by 50%, the percentage increase in its surface area is:$q$,array[$q$50%$q$,$q$100%$q$,$q$125%$q$,$q$225%$q$],3,$q$SA ∝ r²; new = (1.5)² = 2.25× ⇒ increase = 125%.$q$);
select public._seed_arith_q($q$Volume and Surface Area$q$,'very_hard',$q$A cone, a sphere and a cylinder have the same radius r, and the cone and cylinder have height equal to r. Find the ratio of their volumes.$q$,array[$q$1:2:3$q$,$q$1:4:3$q$,$q$3:4:1$q$,$q$1:3:4$q$],2,$q$Cone (1/3)πr³ : sphere (4/3)πr³ : cylinder πr³ = 1:4:3.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
