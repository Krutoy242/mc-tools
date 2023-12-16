{{
function flat(o) { return o.flat(99999).filter(Boolean).join('') }
function interleave(arr, thing) { return [].concat(...arr.map(n => [n, thing])).slice(0, -1) }
}}

Start
  = body:(_ SourceElements? _) {
    return `

// CONVERSION_DEBRIS
// =============================================================
/* eslint max-statements-per-line: "warn" */
/* eslint style/no-multi-spaces: ["error", { ignoreEOLComments: true, exceptions: { "VariableDeclarator": true, "ArrayExpression": true }}] */
/* eslint style/quote-props: ["warn", "consistent-as-needed"] */
/* eslint style/semi: ["error", "always"] */
/* eslint-disable antfu/consistent-list-newline */
/* eslint-disable curly */
/* eslint-disable dot-notation */
/* eslint-disable eqeqeq */
/* eslint-disable import/first */
/* eslint-disable no-unreachable-loop */
/* eslint-disable no-var */
/* eslint-disable object-shorthand */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable prefer-template */
/* eslint-disable style/comma-spacing */
/* eslint-disable style/no-multi-spaces */
/* eslint-disable ts/consistent-type-imports */
/* eslint-disable ts/no-dupe-class-members */
/* eslint-disable ts/no-use-before-define */
/* eslint-disable vars-on-top */

declare function __float(n: number): number; // eslint-disable-line unused-imports/no-unused-vars
declare function __double(n: number): number; // eslint-disable-line unused-imports/no-unused-vars
declare function __byte(n: number): number; // eslint-disable-line unused-imports/no-unused-vars
declare function __short(n: number): number; // eslint-disable-line unused-imports/no-unused-vars
declare function __long(n: number): number; // eslint-disable-line unused-imports/no-unused-vars
declare function $(s: any): any; // eslint-disable-line unused-imports/no-unused-vars
declare function isNull(o: any): boolean; // eslint-disable-line unused-imports/no-unused-vars
declare const recipes: Record<string, any>; // eslint-disable-line unused-imports/no-unused-vars
declare const mods: Record<string, any>; // eslint-disable-line unused-imports/no-unused-vars
declare const craft: Record<string, any>; // eslint-disable-line unused-imports/no-unused-vars
declare const scripts: Record<string, any>; // eslint-disable-line unused-imports/no-unused-vars
declare const furnace: Record<string, any>; // eslint-disable-line unused-imports/no-unused-vars
declare const itemUtils: Record<string, any>; // eslint-disable-line unused-imports/no-unused-vars
declare const oreDict: Record<string, any>; // eslint-disable-line unused-imports/no-unused-vars
declare const game: Record<string, any>; // eslint-disable-line unused-imports/no-unused-vars
declare const crafttweaker: any; // eslint-disable-line unused-imports/no-unused-vars
declare const events: any; // eslint-disable-line unused-imports/no-unused-vars
declare type int = number; // eslint-disable-line unused-imports/no-unused-vars
declare type byte = number; // eslint-disable-line unused-imports/no-unused-vars
declare type float = number; // eslint-disable-line unused-imports/no-unused-vars
declare type double = number; // eslint-disable-line unused-imports/no-unused-vars
declare type short = number; // eslint-disable-line unused-imports/no-unused-vars
declare type long = number; // eslint-disable-line unused-imports/no-unused-vars
declare type bool = boolean; // eslint-disable-line unused-imports/no-unused-vars
// =============================================================
// CONVERSION_DEBRIS

${flat(body)}`
  }

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

LineTerminatorSequence "End of line"
  = "\n"
  / "\r\n"
  / "\r"
  / "\u2028"
  / "\u2029"

Comment "Comment"
  = Preprocessor
  / MultiLineComment
  / SingleLineComment

MultiLineComment
  = "/*" (!"*/" .)* "*/"

SingleLineComment
  = ("//" / "#") body:(!LineTerminator .)* {return '//' + flat(body)}

Preprocessor
  = "#" tail:(PreprocessorList (!LineTerminator .)*) {
    return ["import '#preprocessor ", tail, "';"]
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
  = (WhiteSpace / LineTerminatorSequence / Comment)*

__
  = (WhiteSpace / LineTerminatorSequence / Comment)+

// -----------------------------------------------
Identifier "Identifier"
  = name:IdentifierName {
    const reserved = ('default').split(' ')
    return reserved.includes(flat(name))
      ? ['_$_',name]
      : name
  }

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
  = "as" !Letter _ TypeMutated

TypeMutated
  = head:TypeLiteral tail:("$" IdentifierName)? {
    return [head, tail ? ['/* ', tail, ' */'] : undefined]
  }

TypeLiteral
  = FunctionType
  / "[" body:(_ TypeLiteral? _) "]" {
  	return [...body, "[]"]
  }
  / TypePath (_ "[" _ TypeLiteral? _ "]")*

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
    "-"? (
      DecimalIntegerLiteral "." DecimalDigit*
      / "." DecimalDigit+
      / DecimalIntegerLiteral
    ) ExponentPart?
  ) type:$NumType? {
    if(!type) return num
    const t = type.toLowerCase()
    if(t === 'd') return num
    return [
      ({
        f:'__float',
        b:'__byte',
        s:'__short',
        l:'__long',
      })[t],
      '(', num, ')',
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
  = '"' ("\\" . / !('"') .)* '"'
  / "'" ("\\" . / !("'") .)* "'"

// -----------------------------------------------
// Statement
// -----------------------------------------------
Statement
  = Block
  / BlockWhile
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

BlockWhile
  =  a:("while" _) head:Expression body:(_ "{" _ (StatementList _)? "}") {
    return [a, '(', head, ')', body]
  }

StatementList
  = Statement (_ Statement)*

Conditional
  = "while" _ "(" _ Expression _ ")" _ Statement
  / "if" _ "(" _ Expression _ ")" _ Statement (_ "else" _ Statement)?

Loop
  = LoopOf / LoopIn

LoopOf
  = "for" _ vars:(Identifier (Comma Identifier)*) _ "in" _ from:Expression _ (".."/"to") _ to:Expression _ body:Statement {
    return ['for (let ', vars, ' = ', from, ';', vars, ' < ', to, ';', vars, '++) ', body]
  }

LoopIn
  = "for" _ vars:(Identifier (Comma Identifier)*) _ "in" _ from:Expression _ body:Statement {
    return ['for (const ', vars, ' of ', from, ')', body]
  }

Return
  = "return" _ Expression

Import
  = head:("import" _) classpath:(TypePath) rename:(__ "as" __ Identifier)? {
    const classpathFlat = flat(classpath)
    const s = rename ? flat(rename[3]) : classpathFlat.split(".").pop()
    return [
      head, s ? `${s} from ` : '', "'",
      classpathFlat.startsWith('scripts') ? './' : '',
      classpath, "'"];
  }

VariableDeclaration
  = (Var / Val / Static / Global) __ Declaration

Var = "var" {return '/* $ */let'}
Val = "val" {return '/* $ */const'}
Static = "static" {return '/* static */const'}
Global = "global" {return '/* global */const'}

Declaration
  = Identifier (_ Type)? (_ AssignmentOperator _ Expression)?

Assignment
  = Call _ AssignmentOperator _ Expression

AssignmentOperator "Assignment"
  = "="
  / "~=" { return '/* ~ */+=' }
  / "*=" / "/=" / "%=" / "+=" / "-=" / "&=" / "^=" / "|="

// -----------------------------------------------
// Expression
// -----------------------------------------------
Expression
  = TernaryExpression

TernaryExpression
  = Operator _ "?" _ Expression _ ":" _ Expression
  / Operator

Primary
  = FunctionAnon
  / Capture
  / Identifier
  / Literal
  / ArrayLiteral
  / ObjectLiteral
  / "(" _ Expression _ ")"

Capture
  = "<" body:(!">" .)+ ">" {
    return ["$`", body, "`"]
  }

ArrayLiteral
  = "[" _ ExpressionList* Comma? _ "]"

ObjectLiteral
  = "{" _ "}"
  / "{" _ PropertyNameAndValueList _ "}"
  / "{" _ PropertyNameAndValueList _ "," _ "}"

Comma
  = _","_
  
PropertyNameAndValueList
  = PropertyAssignment (Comma PropertyAssignment)*

PropertyAssignment
  = PropertyKey _ ":" _ Expression

PropertyKey
  = PropertyName &(_ ":")
  / "[" _ Expression _ "]" &(_ ":")
  / body:(Capture &(_ ":") / Expression) {
    return ['/* _ */[',...body,'/* _ */]']
    }

PropertyName
  = IdentifierName
  / StringLiteral
  / minus:($"-"?) body:NumericLiteral {
    return minus
      ? ['/* _ */[', ...minus, ...body, '/* _ */]']
      : body
  }

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
  = Unary (_ OperatorLiteral _ Unary)*

OperatorLiteral "operator"
  = "~" { return '/* ~ */ +' }
  / "has" { return '/* has */in' }
  / "instanceof"
  /"=="/"<="/">="/"%"/"&&"/"&"/"||"/"|"/"*"/"+"/"-"/"/"/"in"/"!="/"<"/">"/"^"

// -----------------------------------------------
SourceElements
  = SourceElement (_ SourceElement)*

SourceElement
  = Statement
  / Function
  / Class

Function "function"
  = body:("function" _ FunctionDefinition) {
    return ['export ', ...body]
  }

FunctionDefinition
  = Identifier _
    "(" _ ParameterList? ")" (_ Type)? _
    "{" _ SourceElements? _ "}"

ParameterList
  = Parameter (_ "," _ Parameter)* _

Parameter
  = Identifier _ Type (_ "=" _ ParameterDefault)?

ParameterDefault
  = Literal
  / "["_"]"
  / Capture

FunctionAnon
  = "function" _
    "(" _ (ParameterAnon (_ "," _ ParameterAnon)* _)? ")" (_ Type)? _
    "{" _ SourceElements? _ "}"

 ParameterAnon
   = Identifier (_ Type)?

 FunctionType
  = "function" _
    a:("(" _) list:TypeLiteral|.., Comma| b:(_? ")")
    type:(_ TypeLiteral)? {
      return [
        '/* function */', a,
        interleave(list.map((o,i)=>[`_arg${i}: `, o]), ', '),
        b, type ? ['/* => */=> ',type] : undefined
      ]
    }

// -----------------------------------------------
// CLASSES
// -----------------------------------------------
Class
  = "zenClass" __  body:(Identifier _
      "{" _ (ClassMember (_ ClassMember)*)? _ "}"
    ) {
      return ['class ', body]
    }

ClassMember
  = Constructor
  / ClassFunction
  / ClassVariableDeclaration _ ";"

ClassFunction
  = "function" body:(_ FunctionDefinition) {
    return ['/* function */', body]
  }

ClassVariableDeclaration
  = body:((CVar / CVal / CStatic) _ Declaration) {
    return ['/* class */', body]
  }

CVar = "var" _ {}
CVal = "val" _ { return 'readonly '}
CStatic = "static" _

Constructor
  = "zenConstructor" _
    "(" _ ParameterList? ")"_
    "{" _ SourceElements? _ "}"
