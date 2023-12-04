{{
function flat(o) { return o.flat(99999).filter(Boolean).join('') }
}}

Start
  = body:(_ SourceElements? _) {return flat(body)}

// -----------------------------------------------

WhiteSpace "whitespace"
  = "\t"
  / "\v"
  / "\f"
  / " "
  / "\u00A0"
  / "\uFEFF"

LineTerminator
  = [\n\r\u2028\u2029]

LineTerminatorSequence "end of line"
  = "\n"
  / "\r\n"
  / "\r"
  / "\u2028"
  / "\u2029"

Comment "comment"
  = MultiLineComment
  / SingleLineComment

MultiLineComment
  = "/*" (!"*/" .)* "*/"

SingleLineComment
  = ("//" / "#") body:(!LineTerminator .)* {return '//' + flat(body)}

Preprocessor
  = "#" tail:(PreprocessorList (!LineTerminator .)*) {
    return ['// ', tail]
  }

PreprocessorList
  = "no_fix_recipe_book"
  / "debug"
  / "loader"
  / "profile"
  / "norun"
  / "reloadable"
  / "ikwid"
  / "zslint"
  / "suppress"
  / "priority"
  / "modloaded"
  / "nowarn"
  / "notreloadable"
  / "ignoreBracketErrors"
  / "hardfail"
  / "onside"
  / "sideonly"
  / "disable_search_tree"

_
  = (WhiteSpace / LineTerminatorSequence / Preprocessor / Comment)*

__
  = (WhiteSpace / LineTerminatorSequence / Preprocessor / Comment)+

// -----------------------------------------------
Identifier
  = IdentifierName

IdentifierName
  = Letter (Letter / DecimalDigit)*

Letter = [a-zA-Z_]

Literal
  = "null"
  / "false"
  / "true"
  / NumericLiteral
  / StringLiteral

// -----------------------------------------------
// TYPES
// -----------------------------------------------

TypeAssignment
  = Call _ TypeCast / Call

Type
  = types:(TypeCast) {
  	return types.map(o=>flat(o).replace(/as/, ":/* as */"))
  }

TypeCast
  = TypeSingle (__ TypeSingle)*

TypeSingle
  = "as" !Letter _ TypeLiteral

TypeLiteral
  = TypePath ("[" _ TypeLiteral? _ "]")*

TypePath
  = IdentifierName (_ "." _ IdentifierName)*

// -----------------------------------------------
// Number
// -----------------------------------------------
NumericLiteral "number"
  = HexIntegerLiteral !(Letter / DecimalDigit)
  / DecimalLiteral !(Letter / DecimalDigit)

DecimalLiteral
  = num:(
    DecimalIntegerLiteral "." DecimalDigit* ExponentPart?
    / "." DecimalDigit+ ExponentPart?
    / DecimalIntegerLiteral ExponentPart?
  ) type:$NumType? {
    if(!type) return num
    return [
      '__',
      ({
        f:'float',d:'double',b:'byte',s:'short',l:'long',
      })[type.toLowerCase()],
      '(',
      num,
      ')',
    ]
  }

NumType
  = [fdbsl]i

DecimalIntegerLiteral
  = "0"
  / NonZeroDigit DecimalDigit*

DecimalDigit
  = [0-9]

NonZeroDigit
  = [1-9]

ExponentPart
  = ExponentIndicator SignedInteger

ExponentIndicator
  = "e"i

SignedInteger
  = [+-]? DecimalDigit+

HexIntegerLiteral
  = "0x"i digits:$HexDigit+

HexDigit
  = [0-9a-f]i

// -----------------------------------------------
// String
// -----------------------------------------------

StringLiteral "string"
  = '"' (!('"') .)* '"'
  / "'" (!("'") .)* "'"

// -----------------------------------------------
// Statement
// -----------------------------------------------
Statement
  = Block
  / Conditional
  / Loop
  / StatementBody _ ";"

StatementBody
  = Import
  / Return
  / VariableDeclaration
  / Assignment
  / Expression

Block
  = "{" _ (StatementList _)? "}"

StatementList
  = Statement (_ Statement)*

Conditional
  = ("if" / "while") _ "(" _ Expression _ ")" _ Statement

Loop
  = LoopOf / LoopIn

LoopOf
  = "for" _ vars:(Identifier) _ "in" _ from:Expression _ (".."/"to") _ to:Expression _ body:Statement {
    return ['for (let ', vars, ' = ', from, ';', vars, ' < ', to, ';', vars, '++) ', body]
  }

LoopIn
  = "for" _ vars:(Identifier) _ "in" _ from:Expression _ body:Statement {
    return ['for (const ', vars, ' of ', from, ')', body]
  }

Return
  = "return" _ Expression

Import
  = head:("import" _) classpath:(TypePath) {
    const s = flat(classpath).split(".").pop()
    return [head, s ? `${s} from ` : '', "'", classpath, "'"];
  }

VariableDeclaration
  = (Var / Val / Static) _ Declaration

Var = "var" {return 'let'}
Val = "val" {return 'const'}
Static = "static" {return '/* static */const'}

Declaration
  = Identifier (_ Type)? _ AssignmentOperator _ Expression

Assignment
  = Member _ AssignmentOperator _ Expression

AssignmentOperator
  = "=" / "*=" / "/=" / "%=" / "+=" / "-=" / "&=" / "^=" / "|="

// -----------------------------------------------
// Expression
// -----------------------------------------------
Expression
  = TernaryExpression

TernaryExpression
  = Operator _ "?" _ Expression _ ":" _ Expression
  / Operator

Primary
  = Capture
  / Identifier
  / Literal
  / ArrayLiteral
  / ObjectLiteral
  / "(" _ Expression _ ")"

Capture
  = "<" body:(!">" .)+ ">" {
    return ["$$$('", body, "')"]
  }

ArrayLiteral
  = "[" _ ExpressionList* Comma? _ "]"

ObjectLiteral
  = "{" _ "}"
  / "{" _ $PropertyAssignment|..,Comma|Comma? _ "}"

Comma
  = _","_

PropertyAssignment
  = PropertyName _ ":" _ Expression

PropertyName
  = IdentifierName
  / StringLiteral
  / "-"? NumericLiteral

Call
  = (Member _ Arguments) (_ Arguments / _ "[" _ Expression _ "]" / _ "." _ IdentifierName)*
  / Member

Arguments
  = "(" _ ExpressionList* _ ")"

ExpressionList
  = Expression (Comma Expression)*

Member
  = Primary
    (
        _ "[" _ Expression _ "]"
      / _ "." _ IdentifierName
    )*

Unary
  = TypeAssignment / UnaryOperator _ Unary

UnaryOperator
  = $("+" !"=")
  / $("-" !"=")
  / "~"
  / "!"

Operator
  = Unary (_ OpertaorLiteral _ Unary)*

OpertaorLiteral
  = "~" {
    return '/* ~ */+'
  }
  /"=="/"<="/">="/"%"/"&&"/"&"/"||"/"|"/"*"/"+"/"-"/"/"/"has"/"in"/"!="/"<"/">"/"^"

// -----------------------------------------------
SourceElements
  = SourceElement (_ SourceElement)*

SourceElement
  = Statement
  / FunctionDeclaration

FunctionDeclaration
  = "function" _ Identifier _
    "(" _ (FormalParameterList _)? ")" (_ Type)? _
    "{" _ SourceElements? _ "}"

FormalParameterList
  = Parameter (_ "," _ Parameter)*

Parameter
  = Identifier _ Type (_ "=" _ Literal)?