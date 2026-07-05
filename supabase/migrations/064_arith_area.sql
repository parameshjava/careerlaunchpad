-- ============================================================================
-- 064_arith_area.sql
-- Question-bank seed: Arithmetic chapter "Area" -- 37 single-answer MCQs
-- from ACTUAL previous-year papers (bank PO/Clerk, SSC, ICET, IT placement) via
-- IndiaBix, PrepInsta, Testbook, Adda247, Oliveboard, CareerPower, Examveda, 2IIM,
-- GeeksforGeeks, Sawaal. Exam-grade floor; answers independently recomputed & each
-- correct option verified; 4 distinct-valued options, one correct; each carries a
-- worked explanation. Depends on 023. Reuses idempotent _seed_arith_q. Safe to re-run.
-- Rectangle/square/triangle/circle/rhombus/trapezium, paths, sectors, %-area change.
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

-- Area (37 questions)
select public._seed_arith_q($q$Area$q$,'easy',$q$The length of a rectangular plot is 15 m and its breadth is 8 m. Find its area.$q$,array[$q$120 m²$q$,$q$115 m²$q$,$q$23 m²$q$,$q$46 m²$q$],1,$q$Area = l × b = 15 × 8 = 120 m².$q$);
select public._seed_arith_q($q$Area$q$,'easy',$q$The perimeter of a square field is 48 m. What is its area?$q$,array[$q$121 m²$q$,$q$196 m²$q$,$q$576 m²$q$,$q$144 m²$q$],4,$q$Side = 48/4 = 12 m; Area = 12² = 144 m².$q$);
select public._seed_arith_q($q$Area$q$,'easy',$q$Find the area of a triangle whose base is 24 cm and corresponding height is 10 cm.$q$,array[$q$60 cm²$q$,$q$140 cm²$q$,$q$120 cm²$q$,$q$240 cm²$q$],3,$q$Area = ½ × base × height = ½ × 24 × 10 = 120 cm².$q$);
select public._seed_arith_q($q$Area$q$,'easy',$q$The radius of a circle is 7 cm. Find its area. (Use π = 22/7)$q$,array[$q$308 cm²$q$,$q$154 cm²$q$,$q$44 cm²$q$,$q$49 cm²$q$],2,$q$Area = πr² = 22/7 × 7² = 154 cm².$q$);
select public._seed_arith_q($q$Area$q$,'easy',$q$The radius of a circular track is 14 m. Find its circumference. (Use π = 22/7)$q$,array[$q$88 m$q$,$q$44 m$q$,$q$176 m$q$,$q$616 m$q$],1,$q$Circumference = 2πr = 2 × 22/7 × 14 = 88 m.$q$);
select public._seed_arith_q($q$Area$q$,'easy',$q$Find the area of a parallelogram with base 12 cm and height 9 cm.$q$,array[$q$21 cm²$q$,$q$54 cm²$q$,$q$96 cm²$q$,$q$108 cm²$q$],4,$q$Area = base × height = 12 × 9 = 108 cm².$q$);
select public._seed_arith_q($q$Area$q$,'easy',$q$The diagonals of a rhombus are 16 cm and 12 cm. Find its area.$q$,array[$q$48 cm²$q$,$q$28 cm²$q$,$q$96 cm²$q$,$q$192 cm²$q$],3,$q$Area = ½ × d₁ × d₂ = ½ × 16 × 12 = 96 cm².$q$);
select public._seed_arith_q($q$Area$q$,'easy',$q$Find the area of a triangle whose sides are 13 cm, 14 cm and 15 cm.$q$,array[$q$168 cm²$q$,$q$84 cm²$q$,$q$42 cm²$q$,$q$91 cm²$q$],2,$q$s = 21; Area = √(21·8·7·6) = √7056 = 84 cm² (Heron).$q$);
select public._seed_arith_q($q$Area$q$,'easy',$q$A rectangle has length 20 m and breadth 15 m. Find its perimeter.$q$,array[$q$70 m$q$,$q$300 m$q$,$q$35 m$q$,$q$140 m$q$],1,$q$Perimeter = 2(l + b) = 2(20 + 15) = 70 m.$q$);
select public._seed_arith_q($q$Area$q$,'medium',$q$The area of a rectangle is 3888 m² and the ratio of its length to breadth is 4 : 3. Find its length.$q$,array[$q$54 m$q$,$q$64 m$q$,$q$81 m$q$,$q$72 m$q$],4,$q$12x² = 3888 → x = 18; length = 4x = 72 m.$q$);
select public._seed_arith_q($q$Area$q$,'medium',$q$A room floor measures 15 m by 8 m. Find the cost of flooring it at ₹25 per m².$q$,array[$q$₹575$q$,$q$₹3600$q$,$q$₹3000$q$,$q$₹2760$q$],3,$q$Area = 120 m²; cost = 120 × 25 = ₹3000.$q$);
select public._seed_arith_q($q$Area$q$,'medium',$q$Find the cost of fencing a rectangular field 40 m by 30 m at ₹12 per metre.$q$,array[$q$₹1200$q$,$q$₹1680$q$,$q$₹840$q$,$q$₹14400$q$],2,$q$Perimeter = 2(40+30) = 140 m; cost = 140 × 12 = ₹1680.$q$);
select public._seed_arith_q($q$Area$q$,'medium',$q$A rectangular field is 60 m long and 40 m wide. A path 5 m wide runs all around it on the outside. Find the area of the path.$q$,array[$q$1100 m²$q$,$q$1000 m²$q$,$q$900 m²$q$,$q$1200 m²$q$],1,$q$Outer 70×50 = 3500; field 2400; path = 3500 − 2400 = 1100 m².$q$);
select public._seed_arith_q($q$Area$q$,'medium',$q$Find the area of a trapezium whose parallel sides are 20 cm and 14 cm and the distance between them is 8 cm.$q$,array[$q$272 cm²$q$,$q$68 cm²$q$,$q$112 cm²$q$,$q$136 cm²$q$],4,$q$Area = ½(a+b)h = ½(34)(8) = 136 cm².$q$);
select public._seed_arith_q($q$Area$q$,'medium',$q$The area of a square is 529 cm². Find the length of its side.$q$,array[$q$27 cm$q$,$q$46 cm$q$,$q$23 cm$q$,$q$21 cm$q$],3,$q$Side = √529 = 23 cm.$q$);
select public._seed_arith_q($q$Area$q$,'medium',$q$A room is 20 m long and 15 m wide. A verandah 2 m wide is built all around inside it. Find the area of the verandah.$q$,array[$q$132 m²$q$,$q$124 m²$q$,$q$176 m²$q$,$q$116 m²$q$],2,$q$Inner 16×11 = 176; room 300; verandah = 300 − 176 = 124 m².$q$);
select public._seed_arith_q($q$Area$q$,'medium',$q$A floor 18 m by 12 m is to be carpeted with carpet 0.75 m wide. What length of carpet is required?$q$,array[$q$288 m$q$,$q$216 m$q$,$q$162 m$q$,$q$324 m$q$],1,$q$Floor area = 216 m²; length = 216 / 0.75 = 288 m.$q$);
select public._seed_arith_q($q$Area$q$,'medium',$q$The area of a rectangle is 460 cm² and its length is 20 cm. Find its breadth.$q$,array[$q$24 cm$q$,$q$20 cm$q$,$q$46 cm$q$,$q$23 cm$q$],4,$q$Breadth = 460 / 20 = 23 cm.$q$);
select public._seed_arith_q($q$Area$q$,'medium',$q$A square lawn has area 1225 m². Find the cost of fencing it at ₹8 per metre.$q$,array[$q$₹1225$q$,$q$₹560$q$,$q$₹1120$q$,$q$₹980$q$],3,$q$Side = √1225 = 35 m; perimeter = 140 m; cost = 140 × 8 = ₹1120.$q$);
select public._seed_arith_q($q$Area$q$,'hard',$q$The length and breadth of a rectangle are 40 cm and 30 cm. Find the length of its diagonal.$q$,array[$q$60 cm$q$,$q$50 cm$q$,$q$70 cm$q$,$q$35 cm$q$],2,$q$Diagonal = √(40²+30²) = √2500 = 50 cm.$q$);
select public._seed_arith_q($q$Area$q$,'hard',$q$The diagonal of a square is 14 cm. Find its area.$q$,array[$q$98 cm²$q$,$q$196 cm²$q$,$q$49 cm²$q$,$q$144 cm²$q$],1,$q$Area = d²/2 = 14²/2 = 98 cm².$q$);
select public._seed_arith_q($q$Area$q$,'hard',$q$The perimeter of a rectangle is 44 cm and the ratio of length to breadth is 7 : 4. Find its area.$q$,array[$q$98 cm²$q$,$q$84 cm²$q$,$q$120 cm²$q$,$q$112 cm²$q$],4,$q$2(11x)=44 → x=2; l=14, b=8; area = 112 cm².$q$);
select public._seed_arith_q($q$Area$q$,'hard',$q$Find the area of a quadrant (90° sector) of a circle of radius 14 cm. (Use π = 22/7)$q$,array[$q$77 cm²$q$,$q$616 cm²$q$,$q$154 cm²$q$,$q$308 cm²$q$],3,$q$Area = 90/360 × 22/7 × 14² = ¼ × 616 = 154 cm².$q$);
select public._seed_arith_q($q$Area$q$,'hard',$q$A figure is formed by a square of side 14 cm with a semicircle drawn on its top side. Find the total area. (Use π = 22/7)$q$,array[$q$308 cm²$q$,$q$273 cm²$q$,$q$350 cm²$q$,$q$231 cm²$q$],2,$q$Square 196 + semicircle ½×22/7×7² = 196 + 77 = 273 cm².$q$);
select public._seed_arith_q($q$Area$q$,'hard',$q$Find the area of a triangle whose sides are 9 cm, 12 cm and 15 cm.$q$,array[$q$54 cm²$q$,$q$108 cm²$q$,$q$60 cm²$q$,$q$72 cm²$q$],1,$q$s = 18; Area = √(18·9·6·3) = √2916 = 54 cm² (Heron; also right triangle).$q$);
select public._seed_arith_q($q$Area$q$,'hard',$q$Find the area of a sector of a circle of radius 21 cm with central angle 60°. (Use π = 22/7)$q$,array[$q$462 cm²$q$,$q$154 cm²$q$,$q$346.5 cm²$q$,$q$231 cm²$q$],4,$q$Area = 60/360 × 22/7 × 21² = 1/6 × 1386 = 231 cm².$q$);
select public._seed_arith_q($q$Area$q$,'hard',$q$Find the area of an equilateral triangle of side 12 cm. (Take √3 = 1.732)$q$,array[$q$124.7 cm²$q$,$q$36 cm²$q$,$q$62.35 cm²$q$,$q$72 cm²$q$],3,$q$Area = (√3/4)a² = (1.732/4)×144 ≈ 62.35 cm².$q$);
select public._seed_arith_q($q$Area$q$,'hard',$q$The area of a rhombus is 216 cm² and one of its diagonals is 24 cm. Find the other diagonal.$q$,array[$q$36 cm$q$,$q$18 cm$q$,$q$9 cm$q$,$q$12 cm$q$],2,$q$½ × 24 × d = 216 → d = 432/24 = 18 cm.$q$);
select public._seed_arith_q($q$Area$q$,'very_hard',$q$The length of a rectangle is increased by 20% and its breadth is decreased by 20%. Find the percentage change in its area.$q$,array[$q$4% decrease$q$,$q$4% increase$q$,$q$No change$q$,$q$8% decrease$q$],1,$q$Factor = 1.2 × 0.8 = 0.96 → 4% decrease.$q$);
select public._seed_arith_q($q$Area$q$,'very_hard',$q$Each of the length and breadth of a rectangle is increased by 10%. By what percentage does its area increase?$q$,array[$q$20%$q$,$q$10%$q$,$q$121%$q$,$q$21%$q$],4,$q$Factor = 1.1 × 1.1 = 1.21 → 21% increase.$q$);
select public._seed_arith_q($q$Area$q$,'very_hard',$q$The largest possible circle is inscribed in a square of side 14 cm. Find the area of the square left uncovered by the circle. (π = 22/7)$q$,array[$q$196 cm²$q$,$q$98 cm²$q$,$q$42 cm²$q$,$q$154 cm²$q$],3,$q$r = 7; square 196 − circle 154 = 42 cm².$q$);
select public._seed_arith_q($q$Area$q$,'very_hard',$q$Find the area of a circular ring whose outer radius is 14 cm and inner radius is 7 cm. (Use π = 22/7)$q$,array[$q$308 cm²$q$,$q$462 cm²$q$,$q$154 cm²$q$,$q$616 cm²$q$],2,$q$Area = π(R²−r²) = 22/7 × (196−49) = 22/7 × 147 = 462 cm².$q$);
select public._seed_arith_q($q$Area$q$,'very_hard',$q$A wire in the shape of a square of side 22 cm is bent to form a circle. Find the area enclosed by the circle. (Use π = 22/7)$q$,array[$q$616 cm²$q$,$q$484 cm²$q$,$q$154 cm²$q$,$q$308 cm²$q$],1,$q$Perimeter 88 cm = circumference → r = 14; area = 22/7×196 = 616 cm².$q$);
select public._seed_arith_q($q$Area$q$,'very_hard',$q$A square has side 14 cm. Four quarter-circles of radius 7 cm are drawn with centres at the four corners. Find the area of the remaining shaded region. (π = 22/7)$q$,array[$q$154 cm²$q$,$q$98 cm²$q$,$q$196 cm²$q$,$q$42 cm²$q$],4,$q$Four quadrants = one full circle = 154; shaded = 196 − 154 = 42 cm².$q$);
select public._seed_arith_q($q$Area$q$,'very_hard',$q$The length of a rectangle is increased by 25% while its area is kept unchanged. By what percentage must the breadth be decreased?$q$,array[$q$15%$q$,$q$12.5%$q$,$q$20%$q$,$q$25%$q$],3,$q$1.25 × k = 1 → k = 0.8 → 20% decrease.$q$);
select public._seed_arith_q($q$Area$q$,'very_hard',$q$A square is inscribed in a circle of radius 7 cm (its diagonal equals the diameter). Find the area of the square.$q$,array[$q$196 cm²$q$,$q$98 cm²$q$,$q$154 cm²$q$,$q$49 cm²$q$],2,$q$Diagonal = 14 cm; area = d²/2 = 196/2 = 98 cm².$q$);
select public._seed_arith_q($q$Area$q$,'very_hard',$q$If each side of a square is increased by 30%, find the percentage increase in its area.$q$,array[$q$69%$q$,$q$60%$q$,$q$30%$q$,$q$90%$q$],1,$q$Factor = 1.3² = 1.69 → 69% increase.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
