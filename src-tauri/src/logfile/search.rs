//! Logical-expression (`AND`/`OR`/`NOT`) and regex search over a memory-mapped
//! file, scanned in parallel with `rayon` (research.md §3).

use memmap2::Mmap;
use rayon::prelude::*;
use regex::Regex;

use crate::error::AppError;
use crate::logfile::mmap_index::line_bytes;

/// Which mode a `query` string should be interpreted as
/// (contracts/mcp-tools.md `search_with_context`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchType {
    Logical,
    Regex,
}

/// AST for a logical search expression: quoted terms combined with
/// `AND`/`OR`/`NOT`/`!`, precedence `NOT` > `AND` > `OR`, matched
/// case-insensitively (research.md §3).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum LogicalExpr {
    Term(String),
    Not(Box<LogicalExpr>),
    And(Box<LogicalExpr>, Box<LogicalExpr>),
    Or(Box<LogicalExpr>, Box<LogicalExpr>),
}

impl LogicalExpr {
    /// `line_lower` must already be lowercased.
    fn is_match(&self, line_lower: &str) -> bool {
        match self {
            LogicalExpr::Term(term) => line_lower.contains(term.as_str()),
            LogicalExpr::Not(inner) => !inner.is_match(line_lower),
            LogicalExpr::And(lhs, rhs) => lhs.is_match(line_lower) && rhs.is_match(line_lower),
            LogicalExpr::Or(lhs, rhs) => lhs.is_match(line_lower) || rhs.is_match(line_lower),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    And,
    Or,
    Not,
    Term(String),
}

/// Splits `input` into operator/term tokens. Quoted terms (`"..."`) are
/// taken verbatim (lowercased); `!` is an alias for `NOT`; bare words that
/// case-insensitively match `AND`/`OR`/`NOT` become operators, otherwise
/// they are treated as terms.
fn tokenize(input: &str) -> Result<Vec<Token>, AppError> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();

    while let Some(&c) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
            continue;
        }

        if c == '"' {
            chars.next();
            let mut term = String::new();
            let mut closed = false;
            for c2 in chars.by_ref() {
                if c2 == '"' {
                    closed = true;
                    break;
                }
                term.push(c2);
            }
            if !closed || term.is_empty() {
                return Err(AppError::InvalidQuery);
            }
            tokens.push(Token::Term(term.to_lowercase()));
            continue;
        }

        if c == '!' {
            chars.next();
            tokens.push(Token::Not);
            continue;
        }

        let mut word = String::new();
        while let Some(&c2) = chars.peek() {
            if c2.is_whitespace() || c2 == '"' || c2 == '!' {
                break;
            }
            word.push(c2);
            chars.next();
        }
        match word.to_uppercase().as_str() {
            "AND" => tokens.push(Token::And),
            "OR" => tokens.push(Token::Or),
            "NOT" => tokens.push(Token::Not),
            _ => tokens.push(Token::Term(word.to_lowercase())),
        }
    }

    Ok(tokens)
}

/// Recursive-descent parser implementing `expr := or`, `or := and (OR and)*`,
/// `and := not (AND not)*`, `not := (NOT|!)* term`, `term := "quoted"|word`.
struct Parser<'a> {
    tokens: &'a [Token],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(tokens: &'a [Token]) -> Self {
        Self { tokens, pos: 0 }
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn advance(&mut self) -> Option<&Token> {
        let token = self.tokens.get(self.pos);
        if token.is_some() {
            self.pos += 1;
        }
        token
    }

    fn parse_or(&mut self) -> Result<LogicalExpr, AppError> {
        let mut expr = self.parse_and()?;
        while matches!(self.peek(), Some(Token::Or)) {
            self.advance();
            let rhs = self.parse_and()?;
            expr = LogicalExpr::Or(Box::new(expr), Box::new(rhs));
        }
        Ok(expr)
    }

    fn parse_and(&mut self) -> Result<LogicalExpr, AppError> {
        let mut expr = self.parse_not()?;
        while matches!(self.peek(), Some(Token::And)) {
            self.advance();
            let rhs = self.parse_not()?;
            expr = LogicalExpr::And(Box::new(expr), Box::new(rhs));
        }
        Ok(expr)
    }

    fn parse_not(&mut self) -> Result<LogicalExpr, AppError> {
        if matches!(self.peek(), Some(Token::Not)) {
            self.advance();
            let inner = self.parse_not()?;
            return Ok(LogicalExpr::Not(Box::new(inner)));
        }
        self.parse_term()
    }

    fn parse_term(&mut self) -> Result<LogicalExpr, AppError> {
        match self.advance() {
            Some(Token::Term(term)) => Ok(LogicalExpr::Term(term.clone())),
            _ => Err(AppError::InvalidQuery),
        }
    }
}

fn parse_logical(input: &str) -> Result<LogicalExpr, AppError> {
    let tokens = tokenize(input)?;
    if tokens.is_empty() {
        return Err(AppError::InvalidQuery);
    }

    let mut parser = Parser::new(&tokens);
    let expr = parser.parse_or()?;
    if parser.pos != tokens.len() {
        return Err(AppError::InvalidQuery);
    }
    Ok(expr)
}

/// A compiled, ready-to-evaluate search query (either a logical expression or
/// a regex), produced by [`CompiledQuery::compile`].
pub(crate) enum CompiledQuery {
    Logical(LogicalExpr),
    Regex(Regex),
}

impl CompiledQuery {
    /// Parses/compiles `query`. Invalid logical expressions and invalid regex
    /// patterns both map to `AppError::InvalidQuery` (FR: no crash/hang on
    /// bad input).
    pub fn compile(search_type: SearchType, query: &str) -> Result<Self, AppError> {
        match search_type {
            SearchType::Logical => parse_logical(query).map(CompiledQuery::Logical),
            SearchType::Regex => Regex::new(query)
                .map(CompiledQuery::Regex)
                .map_err(|_| AppError::InvalidQuery),
        }
    }

    pub fn is_match(&self, line: &str) -> bool {
        match self {
            CompiledQuery::Logical(expr) => expr.is_match(&line.to_lowercase()),
            CompiledQuery::Regex(re) => re.is_match(line),
        }
    }
}

/// Scans every line in `line_offsets` for matches against `query`, returning
/// the 1-based line indices that match in ascending order. Chunks of the
/// index are scanned in parallel via `rayon` (research.md §3).
pub(crate) fn scan_matches(mmap: &Mmap, line_offsets: &[u64], query: &CompiledQuery) -> Vec<usize> {
    (1..=line_offsets.len())
        .into_par_iter()
        .filter(|&line_index| {
            line_bytes(mmap, line_offsets, line_index)
                .map(|bytes| query.is_match(&String::from_utf8_lossy(bytes)))
                .unwrap_or(false)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logical_and_matches_when_both_terms_present() {
        let query = CompiledQuery::compile(SearchType::Logical, r#""error" AND "db""#).unwrap();
        assert!(query.is_match("an error connecting to db"));
        assert!(!query.is_match("an error only"));
    }

    #[test]
    fn logical_or_matches_either_term() {
        let query = CompiledQuery::compile(SearchType::Logical, r#""error" OR "warn""#).unwrap();
        assert!(query.is_match("error here"));
        assert!(query.is_match("warn here"));
        assert!(!query.is_match("info here"));
    }

    #[test]
    fn not_has_higher_precedence_than_and() {
        // NOT "b" AND "a"  ==  (NOT "b") AND "a"
        let query = CompiledQuery::compile(SearchType::Logical, r#"NOT "b" AND "a""#).unwrap();
        assert!(query.is_match("a"));
        assert!(!query.is_match("a b"));
        assert!(!query.is_match("b"));
    }

    #[test]
    fn and_has_higher_precedence_than_or() {
        // "a" AND "b" OR "c"  ==  ("a" AND "b") OR "c"
        let query = CompiledQuery::compile(SearchType::Logical, r#""a" AND "b" OR "c""#).unwrap();
        assert!(query.is_match("a b"));
        assert!(query.is_match("c"));
        assert!(!query.is_match("a"));
    }

    #[test]
    fn matching_is_case_insensitive() {
        let query = CompiledQuery::compile(SearchType::Logical, r#""ERROR""#).unwrap();
        assert!(query.is_match("an error occurred"));
    }

    #[test]
    fn bang_is_alias_for_not() {
        let query = CompiledQuery::compile(SearchType::Logical, r#"!"b""#).unwrap();
        assert!(query.is_match("a"));
        assert!(!query.is_match("b"));
    }

    #[test]
    fn empty_expression_is_invalid() {
        assert!(matches!(
            CompiledQuery::compile(SearchType::Logical, ""),
            Err(AppError::InvalidQuery)
        ));
    }

    #[test]
    fn dangling_operator_is_invalid() {
        assert!(matches!(
            CompiledQuery::compile(SearchType::Logical, r#""a" AND"#),
            Err(AppError::InvalidQuery)
        ));
    }

    #[test]
    fn unclosed_quote_is_invalid() {
        assert!(matches!(
            CompiledQuery::compile(SearchType::Logical, r#""a"#),
            Err(AppError::InvalidQuery)
        ));
    }

    #[test]
    fn compile_regex_matches() {
        let query = CompiledQuery::compile(SearchType::Regex, r"err\w+").unwrap();
        assert!(query.is_match("an error occurred"));
        assert!(!query.is_match("all good"));
    }

    #[test]
    fn invalid_regex_is_invalid_query() {
        assert!(matches!(
            CompiledQuery::compile(SearchType::Regex, "("),
            Err(AppError::InvalidQuery)
        ));
    }
}
