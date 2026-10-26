# YouTube video links

Every sermon video link goes through one rule, in `Backend/tsh/youtube_links.py`.
Importing a video, creating a sermon and editing a sermon all use it, and so do the
source links in search and chat.

## What is accepted

A link is accepted when all of these are true:

- It starts with `http://` or `https://`.
- The host is exactly `youtube.com`, `www.youtube.com`, `m.youtube.com` or `youtu.be`.
- It has no user name, password or port, and no spaces, backslashes or non-ASCII characters.
- It has one of these shapes, with an 11 character id (letters, digits, `-` and `_`):
  - `youtube.com/watch?v=ID`, with exactly one `v=`
  - `youtu.be/ID`
  - `youtube.com/shorts/ID`

Anything else is refused, including look-alike hosts such as
`www.youtube.com.evil.example`, `javascript:` and `ftp:` links, playlists and ids of the wrong length.

## What is saved

The saved `videoLink` is always `https://www.youtube.com/watch?v=<id>`, built from the id,
and `youtubeVideoId` is that id. Extra parts of the pasted link, such as `&t=42s` or `?si=...`, are dropped.
You can send a link, an id or both. If you send both they must be the same video.

## What the API does

`POST /api/sermons` and `PATCH /api/sermons/<id>` check the link before anything else.
A bad link or id sends HTTP 400 with `error` and `message`, and nothing is saved, including the other
fields in the same request. A video that another sermon already uses sends 409.

Source links in search and chat are built from the stored id and the chunk's start time.
A start time that is negative or not a finite number links to the start of the video.
Nothing the user or the model wrote is ever used as a link.

## Old records

Links saved before this rule existed may not follow it. To list them without changing anything,
run this from `Backend`:

```sh
poetry run flask --app "tsh:create_app('testing.cfg')" check-video-links
```

It prints each sermon whose link is not a valid YouTube video link, or whose saved id does not
match its link, and a count. It also counts sermons that have a good link but no saved id, which
is harmless because the id is read from the link.

To fix a record, open the sermon, choose Edit, and save the correct YouTube link. That saves the
canonical link and the id together. Nothing is deleted or rewritten automatically, and the
check above never changes a record.