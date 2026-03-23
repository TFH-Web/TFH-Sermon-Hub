/* This file defines the interface for the sermon data structures used in the Sermons component. It includes properties such as title, speaker, series, date, time, and tags. */
export interface Sermon {
  title: string;
  speaker: string;
  series: string;
  date: string;
  time: string;
  tags: string[];
}