export interface XtreamCredentials {
  url: string
  username: string
  password: string
}

export interface XtreamUserInfo {
  username: string
  password: string
  message: string
  auth: number
  status: string
  exp_date: string
  is_trial: string
  active_cons: string
  created_at: string
  max_connections: string
  allowed_output_formats: string[]
}

export interface XtreamServerInfo {
  url: string
  port: string
  https_port: string
  server_protocol: string
  rtmp_port: string
  timezone: string
  timestamp_now: number
  time_now: string
}

export interface XtreamAccountInfo {
  user_info: XtreamUserInfo
  server_info: XtreamServerInfo
}

export interface XtreamCategory {
  category_id: string
  category_name: string
  parent_id: number
}

export interface XtreamChannel {
  num: number
  name: string
  stream_type: string
  stream_id: number
  stream_icon: string
  epg_channel_id: string
  added: string
  category_id: string
  custom_sid: string
  tv_archive: number
  direct_source: string
  tv_archive_duration: number
}

export interface XtreamMovie {
  num: number
  name: string
  stream_type: string
  stream_id: number
  stream_icon: string
  rating: string
  rating_5based: number
  added: string
  category_id: string
  container_extension: string
  custom_sid: string
  direct_source: string
  plot?: string
  cast?: string
  director?: string
  genre?: string
  release_date?: string
  youtube_trailer?: string
  episode_run_time?: string
  cover?: string
}

export interface XtreamSeries {
  num: number
  name: string
  series_id: number
  cover: string
  plot: string
  cast: string
  director: string
  genre: string
  release_date: string
  last_modified: string
  rating: string
  rating_5based: number
  backdrop_path: string[]
  youtube_trailer: string
  episode_run_time: string
  category_id: string
}

export interface XtreamSeriesInfo {
  info: {
    name: string
    cover: string
    plot: string
    cast: string
    director: string
    genre: string
    release_date: string
    rating: string
    backdrop_path: string[]
    youtube_trailer: string
    episode_run_time: string
    category_id: string
    category_name: string
  }
  episodes: Record<string, XtreamEpisode[]>
  seasons: XtreamSeason[]
}

export interface XtreamEpisode {
  id: string
  episode_num: number
  title: string
  container_extension: string
  info: {
    movie_image: string
    plot: string
    releasedate: string
    rating: string
    duration: string
    duration_secs: number
  }
  added: string
  season: number
  direct_source: string
}

export interface XtreamSeason {
  id: number
  name: string
  episode_count: number
  overview: string
  air_date: string
  cover: string
  cover_big: string
}

export interface EPGItem {
  id: string
  epg_id: string
  title: string
  lang: string
  start: string
  end: string
  description: string
  channel_id: string
  start_timestamp: number
  stop_timestamp: number
  now_playing: number
  has_archive: number
}

export type ViewType = 'home' | 'live' | 'movies' | 'series' | 'radio' | 'favorites' | 'settings'

export interface XtreamPlaylist {
  id: string
  name: string
  url: string
  username: string
  password: string
}
