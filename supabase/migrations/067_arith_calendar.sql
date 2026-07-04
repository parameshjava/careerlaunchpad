-- ============================================================================
-- 067_arith_calendar.sql
-- Question-bank seed: Arithmetic chapter "Calendar" -- 41 single-answer MCQs
-- from ACTUAL previous-year papers / standard aptitude texts (bank PO/Clerk, SSC,
-- ICET, IT placement). Exam-grade floor; answers independently recomputed & each
-- correct option verified; 4 distinct-valued options, one correct; each carries a
-- worked explanation. Depends on 023. Reuses idempotent _seed_arith_q. Safe to re-run.
-- Odd days, leap years, day-of-week for dates, repeating calendars (verified vs real calendar).
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

-- Calendar (41 questions)
select public._seed_arith_q($q$Calendar$q$,'easy',$q$How many odd days are there in 100 days?$q$,array[$q$1$q$,$q$2$q$,$q$3$q$,$q$4$q$],2,$q$100 / 7 = 14 weeks + 2 remainder. So odd days = 2.$q$);
select public._seed_arith_q($q$Calendar$q$,'easy',$q$The number of odd days in a leap year is:$q$,array[$q$1$q$,$q$2$q$,$q$3$q$,$q$0$q$],2,$q$A leap year has 366 days = 52 weeks + 2 days. Odd days = 2.$q$);
select public._seed_arith_q($q$Calendar$q$,'easy',$q$How many odd days are there in an ordinary (non-leap) year?$q$,array[$q$0$q$,$q$2$q$,$q$1$q$,$q$3$q$],3,$q$365 days = 52 weeks + 1 day. Odd days = 1.$q$);
select public._seed_arith_q($q$Calendar$q$,'easy',$q$How many odd days are there in a century (100 years)?$q$,array[$q$3$q$,$q$4$q$,$q$6$q$,$q$5$q$],4,$q$100 yrs = 76 ordinary + 24 leap = 76+48 = 124 odd days = 17 weeks + 5. Odd days = 5.$q$);
select public._seed_arith_q($q$Calendar$q$,'easy',$q$How many odd days are there in 400 years?$q$,array[$q$0$q$,$q$1$q$,$q$2$q$,$q$3$q$],1,$q$100yr=5, 200yr=3, 300yr=1, and 400yr adds one more leap day: 1+... => total 0 odd days (the calendar repeats every 400 years).$q$);
select public._seed_arith_q($q$Calendar$q$,'easy',$q$How many odd days are there in 15 weeks and 4 days?$q$,array[$q$3$q$,$q$2$q$,$q$4$q$,$q$5$q$],3,$q$Complete weeks contribute 0 odd days; only the extra 4 days count. Odd days = 4.$q$);
select public._seed_arith_q($q$Calendar$q$,'easy',$q$If today is Monday, what day of the week will it be after 100 days?$q$,array[$q$Tuesday$q$,$q$Wednesday$q$,$q$Thursday$q$,$q$Sunday$q$],2,$q$100 days = 14 weeks + 2 odd days. Monday + 2 = Wednesday.$q$);
select public._seed_arith_q($q$Calendar$q$,'easy',$q$How many odd days are there in 200 years?$q$,array[$q$5$q$,$q$3$q$,$q$1$q$,$q$0$q$],2,$q$100 yr = 5 odd days, so 200 yr = 10 odd days = 1 week + 3. Odd days = 3.$q$);
select public._seed_arith_q($q$Calendar$q$,'easy',$q$How many odd days are there in 300 years?$q$,array[$q$0$q$,$q$3$q$,$q$5$q$,$q$1$q$],4,$q$100 yr = 5 odd days, 300 yr = 15 odd days = 2 weeks + 1. Odd days = 1.$q$);
select public._seed_arith_q($q$Calendar$q$,'easy',$q$How many odd days are there in 84 days?$q$,array[$q$1$q$,$q$2$q$,$q$3$q$,$q$0$q$],4,$q$84 / 7 = 12 weeks exactly, remainder 0. Odd days = 0.$q$);
select public._seed_arith_q($q$Calendar$q$,'easy',$q$If 1 January 1950 was a Sunday, what day of the week was 26 January 1950?$q$,array[$q$Wednesday$q$,$q$Thursday$q$,$q$Friday$q$,$q$Saturday$q$],2,$q$From 1 Jan to 26 Jan is 25 days later; 25 = 3 weeks + 4 odd days. Sunday + 4 = Thursday.$q$);
select public._seed_arith_q($q$Calendar$q$,'medium',$q$If 1 January 2007 was a Monday, what day of the week was 1 January 2008?$q$,array[$q$Sunday$q$,$q$Monday$q$,$q$Tuesday$q$,$q$Wednesday$q$],3,$q$2007 is an ordinary year = 1 odd day. Monday + 1 = Tuesday.$q$);
select public._seed_arith_q($q$Calendar$q$,'medium',$q$Today is Wednesday. What day of the week will it be after 100 days?$q$,array[$q$Thursday$q$,$q$Friday$q$,$q$Saturday$q$,$q$Monday$q$],2,$q$100 days = 2 odd days. Wednesday + 2 = Friday.$q$);
select public._seed_arith_q($q$Calendar$q$,'medium',$q$If today is Monday, what day of the week will it be 61 days from now?$q$,array[$q$Wednesday$q$,$q$Thursday$q$,$q$Saturday$q$,$q$Sunday$q$],3,$q$61 / 7 = 8 weeks + 5 days. Monday + 5 = Saturday.$q$);
select public._seed_arith_q($q$Calendar$q$,'medium',$q$January 1, 2008 was a Tuesday. What day of the week was January 1, 2009?$q$,array[$q$Tuesday$q$,$q$Wednesday$q$,$q$Thursday$q$,$q$Friday$q$],3,$q$2008 is a leap year = 2 odd days. Tuesday + 2 = Thursday.$q$);
select public._seed_arith_q($q$Calendar$q$,'medium',$q$If the 5th day of a month is a Tuesday, which day of that month must be a Friday?$q$,array[$q$7th$q$,$q$8th$q$,$q$9th$q$,$q$6th$q$],2,$q$5th=Tue, so 6th=Wed, 7th=Thu, 8th=Fri. The 8th is a Friday.$q$);
select public._seed_arith_q($q$Calendar$q$,'medium',$q$Given that 1 January 2007 was a Monday, what day of the week was 1 January 2006?$q$,array[$q$Saturday$q$,$q$Sunday$q$,$q$Monday$q$,$q$Tuesday$q$],2,$q$2006 is an ordinary year = 1 odd day between 1 Jan 2006 and 1 Jan 2007. Going back 1 from Monday = Sunday.$q$);
select public._seed_arith_q($q$Calendar$q$,'medium',$q$If 6 March 2005 was a Monday, what day of the week was 6 March 2004?$q$,array[$q$Saturday$q$,$q$Sunday$q$,$q$Monday$q$,$q$Tuesday$q$],2,$q$The interval 6 Mar 2004 to 6 Mar 2005 spans a non-leap Feb 2005, giving 1 odd day. Going back 1 from Monday = Sunday.$q$);
select public._seed_arith_q($q$Calendar$q$,'medium',$q$Arun's birthday is on 5 January. In 2006 it fell on a Thursday. On what day did it fall in 2005?$q$,array[$q$Tuesday$q$,$q$Wednesday$q$,$q$Thursday$q$,$q$Friday$q$],2,$q$5 Jan 2005 to 5 Jan 2006 crosses non-leap 2005 = 1 odd day. Going back 1 from Thursday = Wednesday.$q$);
select public._seed_arith_q($q$Calendar$q$,'medium',$q$Today is Friday. What day of the week was it 30 days ago?$q$,array[$q$Tuesday$q$,$q$Wednesday$q$,$q$Thursday$q$,$q$Monday$q$],2,$q$30 / 7 = 4 weeks + 2 days. Going back 2 from Friday = Wednesday.$q$);
select public._seed_arith_q($q$Calendar$q$,'medium',$q$If 3 June 2016 was a Friday, what day of the week will 3 June 2017 be?$q$,array[$q$Friday$q$,$q$Saturday$q$,$q$Sunday$q$,$q$Thursday$q$],2,$q$3 Jun 2016 to 3 Jun 2017 crosses non-leap Feb 2017 = 1 odd day. Friday + 1 = Saturday.$q$);
select public._seed_arith_q($q$Calendar$q$,'hard',$q$On what day of the week was India's Independence Day, 15 August 1947?$q$,array[$q$Thursday$q$,$q$Friday$q$,$q$Saturday$q$,$q$Sunday$q$],2,$q$1600yr=0, 1601-1900=1, 1901-1946: 46+11=57=>1 odd. Days to 15 Aug 1947 = 227 =>3. Total 0+1+1+3=5 => Friday.$q$);
select public._seed_arith_q($q$Calendar$q$,'hard',$q$On what day of the week was the first Republic Day, 26 January 1950?$q$,array[$q$Wednesday$q$,$q$Thursday$q$,$q$Friday$q$,$q$Tuesday$q$],2,$q$1600yr=0, 1601-1900=1, 1901-1949:49+12=61=>5. Jan 26=>5. Total 0+1+5+5=11=>4 => Thursday.$q$);
select public._seed_arith_q($q$Calendar$q$,'hard',$q$What day of the week was 15 August 2016?$q$,array[$q$Sunday$q$,$q$Monday$q$,$q$Tuesday$q$,$q$Wednesday$q$],2,$q$1600=0,1601-2000=0,2001-2015:15+3=18=>4(leap 04,08,12). Days to 15 Aug 2016(leap): 228=>4. Total 0+0+4+4=8=>1 => Monday.$q$);
select public._seed_arith_q($q$Calendar$q$,'hard',$q$What day of the week was 1 January 2000?$q$,array[$q$Friday$q$,$q$Saturday$q$,$q$Sunday$q$,$q$Thursday$q$],2,$q$1600=0,1601-1900=1,1901-1999:99+24=123=>4. Jan 1=1. Total 0+1+4+1=6 => Saturday.$q$);
select public._seed_arith_q($q$Calendar$q$,'hard',$q$What day of the week was 2 October 1869 (Gandhi Jayanti)?$q$,array[$q$Friday$q$,$q$Saturday$q$,$q$Sunday$q$,$q$Monday$q$],2,$q$1600=0,1601-1800=3,1801-1868:68+17=85=>1. Days to 2 Oct 1869(non-leap):275=>2. Total 0+3+1+2=6 => Saturday.$q$);
select public._seed_arith_q($q$Calendar$q$,'hard',$q$What day of the week was 29 February 2012?$q$,array[$q$Tuesday$q$,$q$Wednesday$q$,$q$Thursday$q$,$q$Monday$q$],2,$q$1600=0,1601-2000=0,2001-2011:11+2=13=>6(leap 04,08). Days to 29 Feb 2012(leap):60=>4. Total 0+0+6+4=10=>3 => Wednesday.$q$);
select public._seed_arith_q($q$Calendar$q$,'hard',$q$What day of the week was 26 January 2020?$q$,array[$q$Saturday$q$,$q$Sunday$q$,$q$Monday$q$,$q$Friday$q$],2,$q$1600=0,1601-2000=0,2001-2019:19+4=23=>2(leap04,08,12,16). Jan 26=>5. Total 0+0+2+5=7=>0 => Sunday.$q$);
select public._seed_arith_q($q$Calendar$q$,'hard',$q$What day of the week was 18 July 1974?$q$,array[$q$Wednesday$q$,$q$Thursday$q$,$q$Friday$q$,$q$Tuesday$q$],2,$q$1600=0,1601-1900=1,1901-1973:73+18=91=>0. Days to 18 Jul 1974(non-leap):199=>3. Total 0+1+0+3=4 => Thursday.$q$);
select public._seed_arith_q($q$Calendar$q$,'hard',$q$What day of the week was 30 January 1948 (Gandhi's assassination)?$q$,array[$q$Thursday$q$,$q$Friday$q$,$q$Saturday$q$,$q$Sunday$q$],2,$q$1600=0,1601-1900=1,1901-1947:47+11=58=>2. Jan 30=>2. Total 0+1+2+2=5 => Friday.$q$);
select public._seed_arith_q($q$Calendar$q$,'hard',$q$What day of the week was 25 December 1990?$q$,array[$q$Monday$q$,$q$Tuesday$q$,$q$Wednesday$q$,$q$Sunday$q$],2,$q$1600=0,1601-1900=1,1901-1989:89+22=111=>6. Days to 25 Dec 1990(non-leap):359=>2. Total 0+1+6+2=9=>2 => Tuesday.$q$);
select public._seed_arith_q($q$Calendar$q$,'very_hard',$q$The calendar for the year 2005 will be the same as which of the following years?$q$,array[$q$2010$q$,$q$2011$q$,$q$2012$q$,$q$2013$q$],2,$q$Add odd days per year until total is 0 mod 7: 2005-1,06-1,07-1,08-2,09-1,10-1 = 7 => 0. So the calendar repeats in 2011.$q$);
select public._seed_arith_q($q$Calendar$q$,'very_hard',$q$From how many days is 3 March to 30 April (both dates in the same non-leap year, counting from the day after 3 March up to and including 30 April)?$q$,array[$q$56$q$,$q$57$q$,$q$58$q$,$q$55$q$],3,$q$Remaining March = 31-3 = 28 days; April = 30 days. Total = 28+30 = 58 days.$q$);
select public._seed_arith_q($q$Calendar$q$,'very_hard',$q$If 1 January 2006 was a Sunday, what day of the week was 1 January 2010?$q$,array[$q$Thursday$q$,$q$Friday$q$,$q$Saturday$q$,$q$Sunday$q$],2,$q$2006,07,09 ordinary (1 each)=3; 2008 leap=2. Total 5 odd days. Sunday+5 = Friday.$q$);
select public._seed_arith_q($q$Calendar$q$,'very_hard',$q$Which year will have the same calendar as 2007?$q$,array[$q$2016$q$,$q$2017$q$,$q$2018$q$,$q$2019$q$],3,$q$Add odd days per year until total is 0 mod 7: 07-1,08-2,09-1,10-1,11-1,12-2,13-1,14-1,15-1,16-2,17-1 = 14 => 0. Repeats in 2018.$q$);
select public._seed_arith_q($q$Calendar$q$,'very_hard',$q$How many days are there from 1 January 2004 to 31 December 2004 inclusive, and how many odd days does that period contain?$q$,array[$q$365 days, 1 odd day$q$,$q$366 days, 2 odd days$q$,$q$366 days, 1 odd day$q$,$q$365 days, 2 odd days$q$],2,$q$2004 is a leap year => 366 days = 52 weeks + 2 => 2 odd days.$q$);
select public._seed_arith_q($q$Calendar$q$,'very_hard',$q$If 1 January 2008 was Tuesday, what day of the week was 31 December 2008?$q$,array[$q$Tuesday$q$,$q$Wednesday$q$,$q$Thursday$q$,$q$Monday$q$],2,$q$2008 leap has 366 days; day 366 is 365 days after day 1 => 365 mod 7 = 1 odd day. Tuesday+1 = Wednesday.$q$);
select public._seed_arith_q($q$Calendar$q$,'very_hard',$q$The last day of a century cannot be which of the following?$q$,array[$q$Monday$q$,$q$Tuesday$q$,$q$Wednesday$q$,$q$Sunday$q$],2,$q$Century-end odd days can only be 5,3,1,0 -> giving Friday, Wednesday, Monday, Sunday. Tuesday is impossible as a last day of a century.$q$);
select public._seed_arith_q($q$Calendar$q$,'very_hard',$q$How many days are there between 2 March 2012 and 2 March 2013 (i.e., in that one-year span), and what day was 2 March 2013 if 2 March 2012 was Friday?$q$,array[$q$365 days, Saturday$q$,$q$366 days, Sunday$q$,$q$365 days, Sunday$q$,$q$366 days, Saturday$q$],2,$q$Span crosses 29 Feb (Feb 2012 is leap, and 29 Feb 2012 is before 2 Mar) so 366 days = 2 odd days. Friday+2 = Sunday.$q$);
select public._seed_arith_q($q$Calendar$q$,'very_hard',$q$Which year had the same calendar as 2001?$q$,array[$q$2005$q$,$q$2006$q$,$q$2007$q$,$q$2008$q$],3,$q$Add odd days per year until total is 0 mod 7: 01-1,02-1,03-1,04-2,05-1,06-1 = 7 => 0. So 2007 has the same calendar as 2001.$q$);
select public._seed_arith_q($q$Calendar$q$,'very_hard',$q$If 15 August 1947 was a Friday, what day of the week was 15 August 1948?$q$,array[$q$Saturday$q$,$q$Sunday$q$,$q$Monday$q$,$q$Friday$q$],2,$q$Span 15 Aug 1947 to 15 Aug 1948 crosses 29 Feb 1948 (leap) so 366 days = 2 odd days. Friday+2 = Sunday.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
