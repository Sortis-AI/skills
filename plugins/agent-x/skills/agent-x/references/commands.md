# ax command reference

## Tweet operations

```bash
ax tweet post "Hello world"                  # Post a tweet
ax tweet post "With image" --media photo.jpg # Post with media (planned)
ax tweet get <id>                            # Get tweet by ID
ax tweet get <id> --fields id,text           # Get specific fields
ax tweet delete <id>                         # Delete a tweet
ax tweet reply <id> "Nice post!"             # Reply to a tweet
ax tweet quote <id> "This is great"          # Quote tweet
ax tweet search "rust lang" --max-results 20 # Search recent tweets
ax tweet metrics <id>                        # Get engagement metrics
```

## User operations

```bash
ax user get elonmusk                             # Get user profile
ax user timeline elonmusk --max-results 5         # User's recent tweets
ax user followers elonmusk --max-results 100      # User's followers
ax user following elonmusk --max-results 100      # Who user follows
```

## Self operations (authenticated user)

```bash
ax self mentions --max-results 20     # Your recent mentions
ax self bookmarks                     # Your bookmarks
ax self like <id>                     # Like a tweet
ax self unlike <id>                   # Unlike a tweet
ax self retweet <id>                  # Retweet
ax self unretweet <id>                # Undo retweet
ax self bookmark <id>                # Bookmark a tweet
ax self unbookmark <id>              # Remove bookmark
```

## Auth operations

```bash
ax auth login                         # OAuth 2.0 PKCE login (opens browser)
ax auth login --no-browser            # Non-interactive: print URL, use callback
ax auth login --scopes "tweet.read"   # Login with specific scopes
ax auth login --port 9090             # Use custom callback port
ax auth callback <base64-token>       # Complete non-interactive login
ax auth callback --code X --state Y   # Complete login with explicit params
ax auth status                        # Show auth status
ax auth logout                        # Remove stored tokens
```

## Global flags

```bash
ax --output json tweet get <id>       # Force JSON output
ax -o plain tweet search "query"      # TSV output for piping
ax -o markdown user get someone       # Markdown output
ax -o human tweet get <id>            # Rich terminal output
ax --verbose tweet get <id>           # Verbose mode
```

## Pagination

Commands that return lists support `--max-results` and `--next-token`:

```bash
ax tweet search "rust" --max-results 10
# Response includes next_token if more results exist
ax tweet search "rust" --max-results 10 --next-token "abc123"
```
